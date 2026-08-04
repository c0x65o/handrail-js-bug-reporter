import {
  SERVER_SDK_IDENTITY,
  stampReportWithIdentity,
} from "./identity";
import {
  APPLICATION_SESSION_TOKEN_HEADER,
  AUTOMATION_OPTIONS,
  BUG_REPORT_TOKEN_HEADER,
  BugReporterError,
  createHandrailBugReporter,
  normalizeBugReporterEndpoints,
  redactSensitiveValues,
  type BugReporterConfig,
  type HandrailBugReporterClient,
} from "./reporter";

export {
  REPORT_SOURCE,
  SDK_COMMIT,
  SDK_NAME,
  SDK_RELEASE_REF,
  SDK_VERSION,
} from "./identity";
export type {
  ReporterPlatform,
  ReporterRuntime,
  ReporterSdkIdentity,
  StampedBugReport,
} from "./identity";
export {
  APPLICATION_SESSION_TOKEN_HEADER,
  AUTOMATION_OPTIONS,
  BUG_REPORT_TOKEN_HEADER,
  BugReporterError,
  HandrailBugReporterClient,
  MAX_SCREENSHOT_BYTES,
  REDACTED_VALUE,
  normalizeBugReporterEndpoints,
  redactSensitiveValues,
} from "./reporter";
export type {
  AutomationOption,
  AutomationOptionKey,
  BugReportInput,
  BugReporterConfig,
  BugReporterConfigurationSnapshot,
  BugReporterConfigurationStatus,
  BugReporterEndpoints,
  BugReporterErrorCode,
  BugReporterPolicy,
  BugReportSubmissionResult,
  BugReporterTransport,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  RedactionHook,
  ReporterAccessLevel,
  ReporterRetryOptions,
  ScreenshotAttachment,
  SubmissionOptions,
} from "./reporter";

export const SDK_RUNTIME = "node" as const;
export const SDK_PLATFORM = "node" as const;
export const SDK_IDENTITY = SERVER_SDK_IDENTITY;

export function stampReport<T extends Readonly<Record<string, unknown>>>(
  report: T,
) {
  return stampReportWithIdentity(report, SDK_IDENTITY);
}

/** Create a direct Node reporter when no authenticated request is involved. */
export function createBugReporter(config: BugReporterConfig) {
  return createHandrailBugReporter(config, {
    identity: SDK_IDENTITY,
    stamp: stampReport,
  });
}

export type ApplicationSessionTokenResolver<RequestContext> = (
  request: RequestContext,
) => string | null | undefined | Promise<string | null | undefined>;

export interface RequestScopedBugReporterConfig<RequestContext>
  extends Omit<
    BugReporterConfig,
    "applicationSessionTokenProvider" | "transport"
  > {
  /** Called afresh for each policy/submission attempt for this request. */
  readonly resolveApplicationSessionToken?: ApplicationSessionTokenResolver<RequestContext>;
}

export interface RequestScopedBugReporterFactory<RequestContext> {
  /**
   * Create a short-lived client bound only to this authenticated request.
   * The factory never caches a resolved identity or a request object.
   */
  forRequest(request: RequestContext): HandrailBugReporterClient;
}

/**
 * Build a framework-neutral factory for backend routes and server actions.
 * Call `forRequest` inside the authenticated request, never at module scope.
 */
export function createRequestScopedBugReporter<RequestContext>(
  config: RequestScopedBugReporterConfig<RequestContext>,
): RequestScopedBugReporterFactory<RequestContext> {
  const { resolveApplicationSessionToken, ...sharedConfig } = config;
  return Object.freeze({
    forRequest(request: RequestContext) {
      return createBugReporter({
        ...sharedConfig,
        transport: "direct",
        applicationSessionTokenProvider:
          typeof resolveApplicationSessionToken === "function"
            ? () => resolveApplicationSessionToken(request)
            : undefined,
      });
    },
  });
}

export interface SameOriginBugReporterHandlerConfig<RequestType extends Request = Request>
  extends Omit<
    BugReporterConfig,
    | "allowScreenshots"
    | "applicationSessionTokenProvider"
    | "redactionHooks"
    | "transport"
  > {
  readonly apiBaseUrl: string;
  readonly projectId: string;
  readonly environment: string;
  readonly reportToken: string;
  readonly resolveApplicationSessionToken?: ApplicationSessionTokenResolver<RequestType>;
}

export type SameOriginBugReporterHandler<RequestType extends Request = Request> = (
  request: RequestType,
) => Promise<Response>;

const MAX_FORWARD_BODY_BYTES = 28 * 1024 * 1024;
const TRANSIENT_FORWARD_STATUS_CODES = new Set([
  408, 425, 429, 500, 502, 503, 504,
]);
const ALLOWED_AUTOMATION_KEYS = new Set(
  AUTOMATION_OPTIONS.map((option) => option.key),
);

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.trim() || null;
}

function forwardingJson(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function maxAttempts(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value)
    ? Math.min(3, Math.max(1, value))
    : 1;
}

function retryDelay(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(30_000, Math.max(0, value))
    : 250;
}

function wait(milliseconds: number): Promise<void> {
  return milliseconds <= 0
    ? Promise.resolve()
    : new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

function normalizeForwardedPayload(
  input: unknown,
  projectId: string,
  environment: string,
): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const inputBody = input as Record<string, unknown>;
  const profileKey = clean(inputBody.profile_key);
  const body: Record<string, unknown> = {
    ...redactSensitiveValues(inputBody),
  };
  // profile_key is an intentional intake field; all incidental sensitive keys
  // still pass through the package's recursive redactor above.
  if (profileKey) body.profile_key = profileKey;
  body.project_id = projectId;
  body.environment = environment;

  if (body.automation_requests && typeof body.automation_requests === "object") {
    const automation: Record<string, true> = {};
    for (const [key, selected] of Object.entries(
      body.automation_requests as Record<string, unknown>,
    )) {
      if (
        selected === true &&
        ALLOWED_AUTOMATION_KEYS.has(
          key as (typeof AUTOMATION_OPTIONS)[number]["key"],
        )
      ) {
        automation[key] = true;
      }
    }
    if (Object.keys(automation).length) body.automation_requests = automation;
    else delete body.automation_requests;
  } else {
    delete body.automation_requests;
  }

  // These values are server-owned headers and can never be supplied in JSON.
  delete body.application_session_token;
  delete body.report_token;
  return JSON.stringify(body);
}

/**
 * Create a Web Request/Response handler that applications can mount on the
 * same origin at `/api/mobile-bug-reports` and its `/policy` child route.
 * Incoming cookies and authentication headers are consumed only by the
 * application's resolver and are never forwarded to Handrail.
 */
export function createSameOriginBugReporterHandler<
  RequestType extends Request = Request,
>(
  config: SameOriginBugReporterHandlerConfig<RequestType>,
): SameOriginBugReporterHandler<RequestType> {
  const enabled = config.enabled !== false;
  const projectId = clean(config.projectId);
  const environment = clean(config.environment)?.toLowerCase() || null;
  const reportToken = clean(config.reportToken);
  const reportTokenHeader =
    config.reportTokenHeader === BUG_REPORT_TOKEN_HEADER
      ? BUG_REPORT_TOKEN_HEADER
      : "authorization";
  const fetchImpl = config.fetch || globalThis.fetch;
  let endpoints: ReturnType<typeof normalizeBugReporterEndpoints> | null = null;
  try {
    if (config.apiBaseUrl) endpoints = normalizeBugReporterEndpoints(config.apiBaseUrl);
  } catch {
    endpoints = null;
  }
  if (
    enabled &&
    (!endpoints ||
      endpoints.reports.startsWith("/") ||
      !projectId ||
      !environment ||
      !reportToken ||
      typeof fetchImpl !== "function")
  ) {
    throw new BugReporterError(
      "invalid_configuration",
      "Bug reporting is not configured.",
    );
  }
  const attempts = maxAttempts(config.retry?.maxAttempts);
  const delay = retryDelay(config.retry?.delayMs);

  return async (request: RequestType): Promise<Response> => {
    if (!enabled) return forwardingJson(404, "bug_reporting_disabled");
    const isPolicy = request.method === "GET";
    const isSubmission = request.method === "POST";
    if (!isPolicy && !isSubmission) {
      return new Response(null, {
        status: 405,
        headers: { allow: "GET, POST" },
      });
    }

    let body: string | undefined;
    let vanillaBody: string | undefined;
    if (isSubmission) {
      const declaredLength = Number(request.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_FORWARD_BODY_BYTES) {
        return forwardingJson(413, "report_too_large");
      }
      let text: string;
      try {
        text = await request.text();
      } catch {
        return forwardingJson(400, "invalid_report");
      }
      if (new TextEncoder().encode(text).byteLength > MAX_FORWARD_BODY_BYTES) {
        return forwardingJson(413, "report_too_large");
      }
      try {
        body = normalizeForwardedPayload(
          JSON.parse(text),
          projectId!,
          environment!,
        ) || undefined;
      } catch {
        body = undefined;
      }
      if (!body) return forwardingJson(400, "invalid_report");
      const vanillaPayload = JSON.parse(body) as Record<string, unknown>;
      delete vanillaPayload.automation_requests;
      vanillaBody = JSON.stringify(vanillaPayload);
    }

    const endpoint = isPolicy
      ? new URL(endpoints!.policy)
      : new URL(endpoints!.reports);
    if (isPolicy) {
      endpoint.searchParams.set("project_id", projectId!);
      endpoint.searchParams.set("environment", environment!);
    }

    let upstream: Response | null = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) await wait(delay * 2 ** (attempt - 1));
      let applicationSessionToken: string | null = null;
      try {
        applicationSessionToken = clean(
          await config.resolveApplicationSessionToken?.(request),
        );
      } catch {
        applicationSessionToken = null;
      }
      const headers: Record<string, string> = { accept: "application/json" };
      if (isSubmission) headers["content-type"] = "application/json";
      if (reportTokenHeader === BUG_REPORT_TOKEN_HEADER) {
        headers[BUG_REPORT_TOKEN_HEADER] = reportToken!;
      } else {
        headers.authorization = `Bearer ${reportToken}`;
      }
      if (applicationSessionToken) {
        headers[APPLICATION_SESSION_TOKEN_HEADER] = applicationSessionToken;
      }
      try {
        upstream = await fetchImpl(endpoint, {
          method: isPolicy ? "GET" : "POST",
          headers,
          body: isSubmission
            ? applicationSessionToken
              ? body
              : vanillaBody
            : undefined,
          signal: request.signal,
        });
      } catch {
        upstream = null;
      }
      if (
        upstream &&
        (!TRANSIENT_FORWARD_STATUS_CODES.has(upstream.status) ||
          attempt === attempts - 1)
      ) {
        break;
      }
    }

    if (!upstream) return forwardingJson(502, "bug_reporting_unavailable");
    if (!upstream.ok) {
      return forwardingJson(upstream.status, "bug_reporting_rejected");
    }
    let responseBody: string;
    try {
      responseBody = await upstream.text();
    } catch {
      return forwardingJson(502, "bug_reporting_unavailable");
    }
    return new Response(responseBody || null, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") || "application/json",
      },
    });
  };
}
