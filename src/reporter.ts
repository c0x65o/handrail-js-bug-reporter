import type { ReporterSdkIdentity, StampedBugReport } from "./identity";

export const APPLICATION_SESSION_TOKEN_HEADER =
  "x-handrail-application-session-token" as const;
export const BUG_REPORT_TOKEN_HEADER = "x-handrail-bug-report-token" as const;
export const MAX_SCREENSHOT_BYTES = 20 * 1024 * 1024;
export const REDACTED_VALUE = "[REDACTED]" as const;

export const AUTOMATION_OPTIONS = Object.freeze([
  Object.freeze({ key: "auto_verify", label: "Verify this issue" }),
  Object.freeze({
    key: "repair_proposal",
    label: "Prepare a repair proposal",
  }),
  Object.freeze({ key: "fix", label: "Fix this issue" }),
  Object.freeze({
    key: "deploy_staging",
    label: "Deploy the fix to staging",
  }),
  Object.freeze({
    key: "deploy_production",
    label: "Deploy the fix to production",
  }),
] as const);

export type AutomationOptionKey = (typeof AUTOMATION_OPTIONS)[number]["key"];
export type ReporterAccessLevel = "default" | "user" | "full_access";
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface BugReporterEndpoints {
  readonly reports: string;
  readonly policy: string;
}

export interface AutomationOption {
  readonly key: AutomationOptionKey;
  readonly label: string;
}

export interface BugReporterPolicy {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly environment: string;
  readonly identityVerified: true;
  readonly accessLevel: ReporterAccessLevel;
  readonly askOptions: readonly AutomationOption[];
}

export interface ScreenshotAttachment {
  readonly data: string | Blob | ArrayBuffer | ArrayBufferView;
  readonly mimeType?: "image/png" | "image/jpeg";
  readonly filename?: string;
}

export interface BugReportInput {
  readonly title: string;
  readonly description: string;
  readonly severity?: "sev1" | "sev2" | "sev3" | "sev4" | string;
  readonly route?: string;
  readonly appVersion?: string;
  readonly buildNumber?: string;
  readonly commitSha?: string;
  readonly appFlavor?: string;
  readonly reproducer?: string;
  readonly stepsToReproduce?: string;
  readonly profileKey?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly screenshot?: ScreenshotAttachment;
}

export type RedactionHook = (
  report: Readonly<Record<string, JsonValue>>,
) =>
  | Readonly<Record<string, unknown>>
  | Promise<Readonly<Record<string, unknown>>>;

export interface ReporterRetryOptions {
  /** Total request attempts, including the first request. Maximum: 3. */
  readonly maxAttempts?: number;
  /** Base delay before retrying. Each subsequent delay doubles. */
  readonly delayMs?: number;
}

export type BugReporterTransport = "direct" | "same-origin";

export interface BugReporterConfig {
  /** Explicitly set false to create a no-network reporter. Defaults to true. */
  readonly enabled?: boolean;
  /** A Handrail origin, an `/api` base, or the complete intake endpoint. */
  readonly apiBaseUrl?: string;
  readonly projectId?: string;
  readonly environment?: string;
  readonly reportToken?: string;
  /**
   * Use `same-origin` when a server forwarding handler owns the report token
   * and resolves an HttpOnly application session. This mode accepts only an
   * absolute-path API URL and never sends either token from browser code.
   */
  readonly transport?: BugReporterTransport;
  readonly reportTokenHeader?: "authorization" | typeof BUG_REPORT_TOKEN_HEADER;
  readonly applicationSessionTokenProvider?: () =>
    | string
    | null
    | undefined
    | Promise<string | null | undefined>;
  readonly allowScreenshots?: boolean;
  readonly redactionHooks?: readonly RedactionHook[];
  readonly retry?: ReporterRetryOptions;
  readonly fetch?: typeof fetch;
}

export type BugReporterConfigurationStatus =
  | "ready"
  | "disabled"
  | "misconfigured";

export interface BugReporterConfigurationSnapshot {
  readonly status: BugReporterConfigurationStatus;
  readonly enabled: boolean;
  readonly transport: BugReporterTransport;
  readonly endpoint: string | null;
  readonly projectId: string | null;
  readonly environment: string | null;
  readonly hasReportToken: boolean;
  readonly hasApplicationSessionTokenProvider: boolean;
  readonly allowScreenshots: boolean;
  readonly redactionHookCount: number;
  readonly maxAttempts: number;
}

export interface SubmissionOptions {
  readonly automationRequests?: readonly AutomationOptionKey[];
  readonly signal?: AbortSignal;
}

export type BugReportSubmissionResult =
  | Readonly<{ status: "disabled" }>
  | Readonly<{
      status: "submitted";
      statusCode: number;
      response: JsonValue | null;
    }>;

export type BugReporterErrorCode =
  | "invalid_configuration"
  | "invalid_report"
  | "invalid_screenshot"
  | "redaction_failed"
  | "request_failed"
  | "submission_rejected";

/** Error messages are intentionally generic and never include request data. */
export class BugReporterError extends Error {
  readonly code: BugReporterErrorCode;
  readonly statusCode: number | null;

  constructor(
    code: BugReporterErrorCode,
    message: string,
    statusCode: number | null = null,
  ) {
    super(message);
    this.name = "BugReporterError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

interface ReporterIdentityAdapter {
  readonly identity: ReporterSdkIdentity;
  stamp<T extends Readonly<Record<string, unknown>>>(
    report: T,
  ): StampedBugReport<T, ReporterSdkIdentity>;
}

interface NormalizedScreenshot {
  readonly base64: string;
  readonly filename: string;
  readonly mimeType: "image/png" | "image/jpeg";
}

const AUTOMATION_OPTION_BY_KEY = new Map<AutomationOptionKey, AutomationOption>(
  AUTOMATION_OPTIONS.map((option) => [option.key, option]),
);
const ACCESS_LEVELS = new Set<ReporterAccessLevel>([
  "default",
  "user",
  "full_access",
]);
const TRANSIENT_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const CALLER_REPORT_FIELDS = Object.freeze([
  "title",
  "description",
  "severity",
  "route",
  "app_version",
  "build_number",
  "commit_sha",
  "app_flavor",
  "reproducer",
  "metadata",
] as const);
const OMIT = Symbol("omit");

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned || null;
}

function endpointPath(pathname: string): string {
  const path = pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  if (path.endsWith("/api/mobile-bug-reports")) return path;
  if (path.endsWith("/api")) return `${path}/mobile-bug-reports`;
  return `${path}/api/mobile-bug-reports`.replace(/^\/\//, "/");
}

/** Normalize absolute Handrail origins and absolute-path `/api` bases. */
export function normalizeBugReporterEndpoints(
  apiBaseUrl: string,
): BugReporterEndpoints {
  const input = cleanString(apiBaseUrl);
  if (!input || /[?#]/.test(input)) {
    throw new BugReporterError(
      "invalid_configuration",
      "Bug reporting is not configured.",
    );
  }

  if (input.startsWith("/")) {
    if (input.startsWith("//")) {
      throw new BugReporterError(
        "invalid_configuration",
        "Bug reporting is not configured.",
      );
    }
    const reports = endpointPath(input);
    return Object.freeze({ reports, policy: `${reports}/policy` });
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new BugReporterError(
      "invalid_configuration",
      "Bug reporting is not configured.",
    );
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new BugReporterError(
      "invalid_configuration",
      "Bug reporting is not configured.",
    );
  }
  url.pathname = endpointPath(url.pathname);
  const reports = url.toString();
  return Object.freeze({ reports, policy: `${reports}/policy` });
}

function isSensitiveKey(key: string): boolean {
  const normalized = key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
  return (
    /(?:^|_)(?:authorization|proxy_authorization|bearer|cookie|set_cookie|password|passwd|passphrase|credential|credentials|secret|client_secret|private_key|api_key|access_key|profile_key|session|session_id|session_token|access_token|refresh_token|id_token|jwt|csrf|xsrf|verifier|card_number|credit_card|cvv|cvc)(?:_|$)/.test(
      normalized,
    ) ||
    /(?:token|secret|password|credential|private_key)$/.test(normalized) ||
    /(?:^|_)(?:private_message|direct_message|dm_content)(?:_|$)/.test(
      normalized,
    )
  );
}

function jsonValue(
  input: unknown,
  seen: WeakSet<object>,
  depth: number,
): JsonValue | typeof OMIT {
  if (input == null) return null;
  if (typeof input === "string" || typeof input === "boolean") return input;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (typeof input === "bigint") return input.toString();
  if (typeof input !== "object") return OMIT;
  if (input instanceof Date) {
    return Number.isFinite(input.getTime()) ? input.toISOString() : null;
  }
  if (depth >= 20 || seen.has(input)) return "[Circular]";
  seen.add(input);
  try {
    if (Array.isArray(input)) {
      const output: JsonValue[] = [];
      for (const value of input) {
        const normalized = jsonValue(value, seen, depth + 1);
        if (normalized !== OMIT) output.push(normalized);
      }
      return output;
    }
    const output: Record<string, JsonValue> = {};
    for (const [rawKey, value] of Object.entries(input)) {
      const key = rawKey.slice(0, 200);
      if (!key || ["__proto__", "prototype", "constructor"].includes(key)) {
        continue;
      }
      if (isSensitiveKey(key)) {
        output[key] = REDACTED_VALUE;
        continue;
      }
      const normalized = jsonValue(value, seen, depth + 1);
      if (normalized !== OMIT) output[key] = normalized;
    }
    return output;
  } finally {
    seen.delete(input);
  }
}

/** Clone a value into JSON while replacing values under sensitive keys. */
export function redactSensitiveValues(
  input: Readonly<Record<string, unknown>>,
): Readonly<Record<string, JsonValue>> {
  const normalized = jsonValue(input, new WeakSet(), 0);
  if (!normalized || Array.isArray(normalized) || typeof normalized !== "object") {
    return Object.freeze({});
  }
  return normalized as JsonObject;
}

function base64Size(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function normalizeBase64(value: string): string | null {
  const cleaned = value.replace(/\s+/g, "");
  if (
    !cleaned ||
    cleaned.length % 4 === 1 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned) ||
    /=/.test(cleaned.slice(0, -2))
  ) {
    return null;
  }
  return cleaned.padEnd(Math.ceil(cleaned.length / 4) * 4, "=");
}

function base64Prefix(base64: string, byteLimit = 12): Uint8Array {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const output: number[] = [];
  let bits = 0;
  let bitCount = 0;
  for (const character of base64) {
    if (character === "=") break;
    const value = alphabet.indexOf(character);
    if (value < 0) break;
    bits = (bits << 6) | value;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      output.push((bits >> bitCount) & 0xff);
      if (output.length >= byteLimit) break;
      bits &= (1 << bitCount) - 1;
    }
  }
  return new Uint8Array(output);
}

function detectedImageMimeType(
  bytes: Uint8Array,
): "image/png" | "image/jpeg" | null {
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value,
    )
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  return null;
}

function encodeBase64(bytes: Uint8Array): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const chunks: string[] = [];
  const chunkSize = 12_288;
  for (let chunkStart = 0; chunkStart < bytes.length; chunkStart += chunkSize) {
    const end = Math.min(bytes.length, chunkStart + chunkSize);
    let chunk = "";
    for (let index = chunkStart; index < end; index += 3) {
      const first = bytes[index] ?? 0;
      const hasSecond = index + 1 < bytes.length;
      const hasThird = index + 2 < bytes.length;
      const second = bytes[index + 1] ?? 0;
      const third = bytes[index + 2] ?? 0;
      const value = (first << 16) | (second << 8) | third;
      chunk += alphabet[(value >> 18) & 63];
      chunk += alphabet[(value >> 12) & 63];
      chunk += hasSecond ? alphabet[(value >> 6) & 63] : "=";
      chunk += hasThird ? alphabet[value & 63] : "=";
    }
    chunks.push(chunk);
  }
  return chunks.join("");
}

function safeScreenshotFilename(
  value: unknown,
  mimeType: "image/png" | "image/jpeg",
): string {
  const fallback = mimeType === "image/png" ? "screenshot.png" : "screenshot.jpg";
  const cleaned = cleanString(value)
    ?.replace(/[\\/\u0000-\u001f\u007f]/g, "_")
    .slice(0, 200);
  return cleaned || fallback;
}

function screenshotError(): BugReporterError {
  return new BugReporterError(
    "invalid_screenshot",
    "The screenshot must be one PNG or JPEG image no larger than 20 MiB.",
  );
}

async function normalizeScreenshot(
  screenshot: ScreenshotAttachment,
): Promise<NormalizedScreenshot> {
  if (!screenshot || typeof screenshot !== "object" || Array.isArray(screenshot)) {
    throw screenshotError();
  }
  let declaredMimeType = cleanString(screenshot.mimeType);
  let bytes: Uint8Array | null = null;
  let base64: string | null = null;

  if (typeof screenshot.data === "string") {
    let encoded = screenshot.data;
    const dataUrl = encoded.match(/^data:([^;,]+);base64,([\s\S]*)$/i);
    if (dataUrl) {
      if (declaredMimeType && declaredMimeType !== dataUrl[1].toLowerCase()) {
        throw screenshotError();
      }
      declaredMimeType = dataUrl[1].toLowerCase();
      encoded = dataUrl[2];
    }
    base64 = normalizeBase64(encoded);
    if (!base64 || base64Size(base64) > MAX_SCREENSHOT_BYTES) {
      throw screenshotError();
    }
    bytes = base64Prefix(base64);
  } else if (
    typeof Blob !== "undefined" &&
    screenshot.data instanceof Blob
  ) {
    if (screenshot.data.size > MAX_SCREENSHOT_BYTES) throw screenshotError();
    if (declaredMimeType && screenshot.data.type && declaredMimeType !== screenshot.data.type) {
      throw screenshotError();
    }
    declaredMimeType = declaredMimeType || cleanString(screenshot.data.type);
    bytes = new Uint8Array(await screenshot.data.arrayBuffer());
  } else if (ArrayBuffer.isView(screenshot.data)) {
    bytes = new Uint8Array(
      screenshot.data.buffer,
      screenshot.data.byteOffset,
      screenshot.data.byteLength,
    );
  } else if (screenshot.data instanceof ArrayBuffer) {
    bytes = new Uint8Array(screenshot.data);
  } else {
    throw screenshotError();
  }

  const detectedMimeType = detectedImageMimeType(bytes);
  if (
    !detectedMimeType ||
    !["image/png", "image/jpeg"].includes(declaredMimeType || detectedMimeType) ||
    (declaredMimeType && declaredMimeType !== detectedMimeType) ||
    (!base64 && bytes.byteLength > MAX_SCREENSHOT_BYTES)
  ) {
    throw screenshotError();
  }
  base64 ||= encodeBase64(bytes);
  return Object.freeze({
    base64,
    filename: safeScreenshotFilename(screenshot.filename, detectedMimeType),
    mimeType: detectedMimeType,
  });
}

function randomEventId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `js-${globalThis.crypto.randomUUID()}`;
  }
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    return `js-${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
  }
  return `js-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function normalizedAttempts(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value)
    ? Math.min(3, Math.max(1, value))
    : 1;
}

function normalizedDelay(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(30_000, Math.max(0, value))
    : 250;
}

function sleep(milliseconds: number): Promise<void> {
  return milliseconds <= 0
    ? Promise.resolve()
    : new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

function jsonObjectOrNull(input: unknown): JsonValue | null {
  const value = jsonValue(input, new WeakSet(), 0);
  return value === OMIT ? null : value;
}

export class HandrailBugReporterClient {
  readonly configuration: BugReporterConfigurationSnapshot;

  private readonly endpoints: BugReporterEndpoints | null;
  private readonly projectId: string | null;
  private readonly environment: string | null;
  private readonly reportToken: string | null;
  private readonly transport: BugReporterTransport;
  private readonly reportTokenHeader:
    | "authorization"
    | typeof BUG_REPORT_TOKEN_HEADER;
  private readonly sessionProvider: BugReporterConfig["applicationSessionTokenProvider"];
  private readonly allowScreenshots: boolean;
  private readonly redactionHooks: readonly RedactionHook[];
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;
  private readonly fetchImpl: typeof fetch | null;
  private readonly identityAdapter: ReporterIdentityAdapter;
  #policy: BugReporterPolicy | null = null;

  constructor(config: BugReporterConfig, identityAdapter: ReporterIdentityAdapter) {
    const enabled = config.enabled !== false;
    this.identityAdapter = identityAdapter;
    this.projectId = cleanString(config.projectId);
    this.environment = cleanString(config.environment)?.toLowerCase() || null;
    this.reportToken = cleanString(config.reportToken);
    this.transport = config.transport === "same-origin" ? "same-origin" : "direct";
    this.reportTokenHeader =
      config.reportTokenHeader === BUG_REPORT_TOKEN_HEADER
        ? BUG_REPORT_TOKEN_HEADER
        : "authorization";
    this.sessionProvider = config.applicationSessionTokenProvider;
    this.allowScreenshots = config.allowScreenshots === true;
    this.redactionHooks = Object.freeze([...(config.redactionHooks || [])]);
    this.maxAttempts = normalizedAttempts(config.retry?.maxAttempts);
    this.retryDelayMs = normalizedDelay(config.retry?.delayMs);
    const availableFetch = config.fetch || globalThis.fetch;
    this.fetchImpl =
      typeof availableFetch === "function" ? availableFetch.bind(globalThis) : null;

    let endpoints: BugReporterEndpoints | null = null;
    try {
      if (config.apiBaseUrl) {
        endpoints = normalizeBugReporterEndpoints(config.apiBaseUrl);
      }
    } catch {
      endpoints = null;
    }
    this.endpoints = endpoints;
    const directReady = this.transport === "direct" && Boolean(this.reportToken);
    const forwardingReady =
      this.transport === "same-origin" &&
      Boolean(endpoints?.reports.startsWith("/")) &&
      !this.reportToken &&
      typeof this.sessionProvider !== "function";
    const ready = Boolean(
      endpoints &&
        this.projectId &&
        this.environment &&
        this.fetchImpl &&
        (directReady || forwardingReady),
    );
    const status: BugReporterConfigurationStatus = !enabled
      ? "disabled"
      : ready
        ? "ready"
        : "misconfigured";
    this.configuration = Object.freeze({
      status,
      enabled,
      transport: this.transport,
      endpoint: endpoints?.reports || null,
      projectId: this.projectId,
      environment: this.environment,
      hasReportToken: Boolean(this.reportToken),
      hasApplicationSessionTokenProvider:
        typeof this.sessionProvider === "function",
      allowScreenshots: this.allowScreenshots,
      redactionHookCount: this.redactionHooks.length,
      maxAttempts: this.maxAttempts,
    });
  }

  get currentPolicy(): BugReporterPolicy | null {
    return this.#policy;
  }

  async discoverPolicy(signal?: AbortSignal): Promise<BugReporterPolicy | null> {
    this.#policy = null;
    if (this.configuration.status !== "ready") return null;
    const endpoint = new URL(
      this.endpoints!.policy,
      this.endpoints!.policy.startsWith("/") ? "http://relative.invalid" : undefined,
    );
    endpoint.searchParams.set("project_id", this.projectId!);
    endpoint.searchParams.set("environment", this.environment!);
    const policyUrl = this.endpoints!.policy.startsWith("/")
      ? `${endpoint.pathname}${endpoint.search}`
      : endpoint.toString();

    const response = await this.requestWithRetries(policyUrl, {
      method: "GET",
      signal,
    });
    if (!response?.ok) return null;
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return null;
    }
    const policy = this.parsePolicy(body);
    this.#policy = policy;
    return policy;
  }

  loadPolicy(signal?: AbortSignal): Promise<BugReporterPolicy | null> {
    return this.discoverPolicy(signal);
  }

  async submit(
    input: BugReportInput,
    options: SubmissionOptions = {},
  ): Promise<BugReportSubmissionResult> {
    if (this.configuration.status === "disabled") {
      return Object.freeze({ status: "disabled" });
    }
    if (this.configuration.status !== "ready") {
      throw new BugReporterError(
        "invalid_configuration",
        "Bug reporting is not configured.",
      );
    }

    const payload = await this.buildPayload(input);
    const allowedAutomation = this.allowedAutomationRequests(
      options.automationRequests,
    );
    const vanillaBody = JSON.stringify(payload);
    const automationBody = allowedAutomation
      ? JSON.stringify({ ...payload, automation_requests: allowedAutomation })
      : null;
    const response = await this.requestWithRetries(this.endpoints!.reports, {
      method: "POST",
      signal: options.signal,
      vanillaBody,
      automationBody,
    });
    if (!response) {
      throw new BugReporterError(
        "request_failed",
        "The bug report could not be sent. Please try again.",
      );
    }
    if (!response.ok) {
      throw new BugReporterError(
        "submission_rejected",
        "The bug report was not accepted.",
        response.status,
      );
    }
    let responseBody: JsonValue | null = null;
    try {
      const text = await response.text();
      responseBody = text ? jsonObjectOrNull(JSON.parse(text)) : null;
    } catch {
      responseBody = null;
    }
    return Object.freeze({
      status: "submitted",
      statusCode: response.status,
      response: responseBody,
    });
  }

  private async buildPayload(
    input: BugReportInput,
  ): Promise<Readonly<Record<string, unknown>>> {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new BugReporterError(
        "invalid_report",
        "A report title and description are required.",
      );
    }
    let callerFields: Readonly<Record<string, JsonValue>> =
      redactSensitiveValues({
        title: input.title,
        description: input.description,
        severity: input.severity,
        route: input.route,
        app_version: input.appVersion,
        build_number: input.buildNumber,
        commit_sha: input.commitSha,
        app_flavor: input.appFlavor,
        reproducer: input.reproducer || input.stepsToReproduce,
        metadata: input.metadata,
      });
    try {
      for (const hook of this.redactionHooks) {
        callerFields = redactSensitiveValues(await hook(callerFields));
      }
    } catch {
      throw new BugReporterError(
        "redaction_failed",
        "The bug report could not be safely prepared.",
      );
    }
    const title = cleanString(callerFields.title);
    const description = cleanString(callerFields.description);
    if (!title || !description) {
      throw new BugReporterError(
        "invalid_report",
        "A report title and description are required.",
      );
    }
    const allowedCallerFields: Record<string, JsonValue> = {};
    for (const key of CALLER_REPORT_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(callerFields, key)) {
        allowedCallerFields[key] = callerFields[key];
      }
    }
    const payload: Record<string, unknown> = {
      ...allowedCallerFields,
      title,
      description,
      project_id: this.projectId,
      environment: this.environment,
      event_id: randomEventId(),
    };
    const profileKey = cleanString(input.profileKey);
    if (profileKey) payload.profile_key = profileKey;
    if (input.screenshot) {
      if (!this.allowScreenshots) throw screenshotError();
      const screenshot = await normalizeScreenshot(input.screenshot);
      payload.screenshot_base64 = screenshot.base64;
      payload.screenshot_filename = screenshot.filename;
      payload.screenshot_mime_type = screenshot.mimeType;
    }
    return this.identityAdapter.stamp(payload);
  }

  private allowedAutomationRequests(
    requested: readonly AutomationOptionKey[] | undefined,
  ): Readonly<Record<string, true>> | null {
    if (!this.#policy || !requested?.length) return null;
    const available = new Set(
      this.#policy.askOptions.map((option) => option.key),
    );
    const selected = new Set(requested);
    const output: Record<string, true> = {};
    for (const option of AUTOMATION_OPTIONS) {
      if (available.has(option.key) && selected.has(option.key)) {
        output[option.key] = true;
      }
    }
    return Object.keys(output).length ? Object.freeze(output) : null;
  }

  private parsePolicy(input: unknown): BugReporterPolicy | null {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const body = input as Record<string, unknown>;
    const reporter = body.reporter;
    if (
      body.schema_version !== 1 ||
      body.project_id !== this.projectId ||
      cleanString(body.environment)?.toLowerCase() !== this.environment ||
      !reporter ||
      typeof reporter !== "object" ||
      Array.isArray(reporter)
    ) {
      return null;
    }
    const reporterRecord = reporter as Record<string, unknown>;
    const accessLevel = cleanString(reporterRecord.access_level) as
      | ReporterAccessLevel
      | null;
    if (
      reporterRecord.identity_verified !== true ||
      !accessLevel ||
      !ACCESS_LEVELS.has(accessLevel) ||
      !Array.isArray(body.ask_options)
    ) {
      return null;
    }
    const optionKeys = new Set<AutomationOptionKey>();
    for (const item of body.ask_options) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const key = (item as Record<string, unknown>).key;
      if (typeof key === "string" && AUTOMATION_OPTION_BY_KEY.has(key as AutomationOptionKey)) {
        optionKeys.add(key as AutomationOptionKey);
      }
    }
    const askOptions = Object.freeze(
      AUTOMATION_OPTIONS.filter((option) => optionKeys.has(option.key)),
    );
    return Object.freeze({
      schemaVersion: 1,
      projectId: this.projectId!,
      environment: this.environment!,
      identityVerified: true,
      accessLevel,
      askOptions,
    });
  }

  private async freshSessionToken(): Promise<string | null> {
    if (typeof this.sessionProvider !== "function") return null;
    try {
      return cleanString(await this.sessionProvider());
    } catch {
      return null;
    }
  }

  private async requestWithRetries(
    url: string,
    input: {
      readonly method: "GET" | "POST";
      readonly signal?: AbortSignal;
      readonly vanillaBody?: string;
      readonly automationBody?: string | null;
    },
  ): Promise<Response | null> {
    let lastResponse: Response | null = null;
    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      if (attempt > 0) {
        await sleep(this.retryDelayMs * 2 ** (attempt - 1));
      }
      const applicationSessionToken = await this.freshSessionToken();
      const headers: Record<string, string> = {
        accept: "application/json",
      };
      if (input.method === "POST") headers["content-type"] = "application/json";
      if (this.transport === "direct") {
        if (this.reportTokenHeader === BUG_REPORT_TOKEN_HEADER) {
          headers[BUG_REPORT_TOKEN_HEADER] = this.reportToken!;
        } else {
          headers.authorization = `Bearer ${this.reportToken}`;
        }
      }
      if (this.transport === "direct" && applicationSessionToken) {
        headers[APPLICATION_SESSION_TOKEN_HEADER] = applicationSessionToken;
      }
      try {
        lastResponse = await this.fetchImpl!(url, {
          method: input.method,
          headers,
          body:
            input.method === "POST"
              ? (applicationSessionToken || this.transport === "same-origin") &&
                input.automationBody
                ? input.automationBody
                : input.vanillaBody
              : undefined,
          credentials:
            this.transport === "same-origin" ? "same-origin" : undefined,
          signal: input.signal,
        });
      } catch {
        lastResponse = null;
      }
      if (
        lastResponse &&
        (!TRANSIENT_STATUS_CODES.has(lastResponse.status) ||
          attempt === this.maxAttempts - 1)
      ) {
        return lastResponse;
      }
      if (!lastResponse && attempt === this.maxAttempts - 1) return null;
    }
    return lastResponse;
  }
}

export function createHandrailBugReporter(
  config: BugReporterConfig,
  identityAdapter: ReporterIdentityAdapter,
): HandrailBugReporterClient {
  return new HandrailBugReporterClient(config, identityAdapter);
}
