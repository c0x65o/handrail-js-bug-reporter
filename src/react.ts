import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  Dispatch,
  PropsWithChildren,
  ReactElement,
  SetStateAction,
} from "react";
import {
  REACT_SDK_IDENTITY,
  stampReportWithIdentity,
} from "./identity";
import {
  BugReporterError,
  createHandrailBugReporter,
  type AutomationOption,
  type AutomationOptionKey,
  type BugReportInput,
  type BugReporterConfig,
  type BugReporterPolicy,
  type BugReportSubmissionResult,
  type HandrailBugReporterClient,
  type ScreenshotAttachment,
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
  BugReporterUpstreamError,
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

export const SDK_RUNTIME = "react" as const;
export const SDK_PLATFORM = "browser" as const;
export const SDK_IDENTITY = REACT_SDK_IDENTITY;

const HandrailBugReporterIdentityContext = createContext(SDK_IDENTITY);

export function HandrailBugReporterIdentityProvider({
  children,
}: PropsWithChildren): ReactElement {
  return createElement(
    HandrailBugReporterIdentityContext.Provider,
    { value: SDK_IDENTITY },
    children,
  );
}

export function useHandrailBugReporterIdentity() {
  return useContext(HandrailBugReporterIdentityContext);
}

export function stampReport<T extends Readonly<Record<string, unknown>>>(
  report: T,
) {
  return stampReportWithIdentity(report, SDK_IDENTITY);
}

export function createBugReporter(config: BugReporterConfig) {
  return createHandrailBugReporter(config, {
    identity: SDK_IDENTITY,
    stamp: stampReport,
  });
}

export interface BugReporterFormState {
  readonly title: string;
  readonly description: string;
  readonly severity?: string;
  readonly route?: string;
  readonly appVersion?: string;
  readonly buildNumber?: string;
  readonly commitSha?: string;
  readonly appFlavor?: string;
  readonly reproducer?: string;
  readonly profileKey?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly screenshot: ScreenshotAttachment | null;
  readonly automationRequests: readonly AutomationOptionKey[];
}

export type BugReporterPolicyStatus =
  | "idle"
  | "loading"
  | "ready"
  | "unavailable";
export type BugReporterSubmissionStatus =
  | "idle"
  | "submitting"
  | "submitted"
  | "disabled"
  | "error";

export interface BugReporterSubmissionState {
  readonly status: BugReporterSubmissionStatus;
  readonly result: BugReportSubmissionResult | null;
  readonly error: BugReporterError | null;
}

export interface HandrailBugReporterContextValue {
  readonly reporter: HandrailBugReporterClient;
  readonly policy: BugReporterPolicy | null;
  readonly policyStatus: BugReporterPolicyStatus;
  /** True whenever no verified policy-derived controls are available. */
  readonly isVanilla: boolean;
  readonly automationOptions: readonly AutomationOption[];
  readonly canAttachScreenshot: boolean;
  readonly form: BugReporterFormState;
  readonly setForm: Dispatch<SetStateAction<BugReporterFormState>>;
  updateForm(patch: Partial<BugReporterFormState>): void;
  replaceScreenshot(screenshot: ScreenshotAttachment): void;
  removeScreenshot(): void;
  setAutomationRequest(key: AutomationOptionKey, selected: boolean): void;
  refreshPolicy(): Promise<BugReporterPolicy | null>;
  submit(
    overrides?: Partial<BugReportInput>,
  ): Promise<BugReportSubmissionResult>;
  readonly submission: BugReporterSubmissionState;
  resetSubmission(): void;
}

export interface HandrailBugReporterProviderProps extends PropsWithChildren {
  readonly config: BugReporterConfig;
  readonly initialForm?: Partial<BugReporterFormState>;
  /** Policy discovery is best effort and enabled by default. */
  readonly loadPolicyOnMount?: boolean;
}

const EMPTY_SUBMISSION: BugReporterSubmissionState = Object.freeze({
  status: "idle",
  result: null,
  error: null,
});

function initialFormState(
  initial: Partial<BugReporterFormState> | undefined,
): BugReporterFormState {
  return {
    title: initial?.title || "",
    description: initial?.description || "",
    severity: initial?.severity,
    route: initial?.route,
    appVersion: initial?.appVersion,
    buildNumber: initial?.buildNumber,
    commitSha: initial?.commitSha,
    appFlavor: initial?.appFlavor,
    reproducer: initial?.reproducer,
    profileKey: initial?.profileKey,
    metadata: initial?.metadata,
    screenshot: initial?.screenshot || null,
    automationRequests: Object.freeze([...(initial?.automationRequests || [])]),
  };
}

const HandrailBugReporterContext =
  createContext<HandrailBugReporterContextValue | null>(null);

/**
 * Renderless controller for policy, form, screenshot, and submission state.
 * It registers no global listeners and reads or writes no browser storage.
 */
export function HandrailBugReporterProvider({
  children,
  config,
  initialForm,
  loadPolicyOnMount = true,
}: HandrailBugReporterProviderProps): ReactElement {
  const reporter = useMemo(() => createBugReporter(config), [config]);
  const [policy, setPolicy] = useState<BugReporterPolicy | null>(null);
  const [policyStatus, setPolicyStatus] =
    useState<BugReporterPolicyStatus>("idle");
  const [form, setForm] = useState<BugReporterFormState>(() =>
    initialFormState(initialForm),
  );
  const [submission, setSubmission] =
    useState<BugReporterSubmissionState>(EMPTY_SUBMISSION);

  const applyPolicy = useCallback((nextPolicy: BugReporterPolicy | null) => {
    setPolicy(nextPolicy);
    setPolicyStatus(nextPolicy ? "ready" : "unavailable");
    const allowed = new Set(nextPolicy?.askOptions.map((option) => option.key));
    setForm((current) => ({
      ...current,
      automationRequests: nextPolicy
        ? current.automationRequests.filter((key) => allowed.has(key))
        : [],
    }));
  }, []);

  const refreshPolicy = useCallback(async () => {
    setPolicy(null);
    setPolicyStatus("loading");
    const nextPolicy = await reporter.discoverPolicy();
    applyPolicy(nextPolicy);
    return nextPolicy;
  }, [applyPolicy, reporter]);

  useEffect(() => {
    let active = true;
    if (!loadPolicyOnMount) {
      setPolicy(null);
      setPolicyStatus("idle");
      return () => {
        active = false;
      };
    }
    setPolicy(null);
    setPolicyStatus("loading");
    void reporter.discoverPolicy().then((nextPolicy) => {
      if (active) applyPolicy(nextPolicy);
    });
    return () => {
      active = false;
    };
  }, [applyPolicy, loadPolicyOnMount, reporter]);

  const updateForm = useCallback((patch: Partial<BugReporterFormState>) => {
    setForm((current) => ({ ...current, ...patch }));
  }, []);

  const replaceScreenshot = useCallback((screenshot: ScreenshotAttachment) => {
    setForm((current) => ({ ...current, screenshot }));
  }, []);

  const removeScreenshot = useCallback(() => {
    setForm((current) => ({ ...current, screenshot: null }));
  }, []);

  const setAutomationRequest = useCallback(
    (key: AutomationOptionKey, selected: boolean) => {
      setForm((current) => {
        const currentPolicy = policy;
        const allowed = currentPolicy?.askOptions.some(
          (option) => option.key === key,
        );
        if (!allowed || !currentPolicy) return current;
        const selectedKeys = new Set(current.automationRequests);
        if (selected) selectedKeys.add(key);
        else selectedKeys.delete(key);
        return {
          ...current,
          automationRequests: currentPolicy.askOptions
            .map((option) => option.key)
            .filter((optionKey) => selectedKeys.has(optionKey)),
        };
      });
    },
    [policy],
  );

  const submit = useCallback(
    async (overrides: Partial<BugReportInput> = {}) => {
      setSubmission({ status: "submitting", result: null, error: null });
      const input: BugReportInput = {
        title: form.title,
        description: form.description,
        severity: form.severity,
        route: form.route,
        appVersion: form.appVersion,
        buildNumber: form.buildNumber,
        commitSha: form.commitSha,
        appFlavor: form.appFlavor,
        reproducer: form.reproducer,
        profileKey: form.profileKey,
        metadata: form.metadata,
        screenshot: form.screenshot || undefined,
        ...overrides,
      };
      try {
        const result = await reporter.submit(input, {
          automationRequests: form.automationRequests,
        });
        setSubmission({
          status: result.status === "disabled" ? "disabled" : "submitted",
          result,
          error: null,
        });
        return result;
      } catch (error) {
        const safeError =
          error instanceof BugReporterError
            ? error
            : new BugReporterError(
                "request_failed",
                "The bug report could not be sent. Please try again.",
              );
        setSubmission({ status: "error", result: null, error: safeError });
        throw safeError;
      }
    },
    [form, reporter],
  );

  const resetSubmission = useCallback(() => {
    setSubmission(EMPTY_SUBMISSION);
  }, []);

  const value = useMemo<HandrailBugReporterContextValue>(
    () => ({
      reporter,
      policy,
      policyStatus,
      isVanilla: policyStatus !== "loading" && policy === null,
      automationOptions: policy?.askOptions || [],
      canAttachScreenshot: reporter.configuration.allowScreenshots,
      form,
      setForm,
      updateForm,
      replaceScreenshot,
      removeScreenshot,
      setAutomationRequest,
      refreshPolicy,
      submit,
      submission,
      resetSubmission,
    }),
    [
      form,
      policy,
      policyStatus,
      refreshPolicy,
      removeScreenshot,
      replaceScreenshot,
      reporter,
      resetSubmission,
      setAutomationRequest,
      submission,
      submit,
      updateForm,
    ],
  );

  return createElement(
    HandrailBugReporterIdentityContext.Provider,
    { value: SDK_IDENTITY },
    createElement(HandrailBugReporterContext.Provider, { value }, children),
  );
}

export function useHandrailBugReporter(): HandrailBugReporterContextValue {
  const context = useContext(HandrailBugReporterContext);
  if (!context) {
    throw new Error(
      "useHandrailBugReporter must be used inside HandrailBugReporterProvider.",
    );
  }
  return context;
}
