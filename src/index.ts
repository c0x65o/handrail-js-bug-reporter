import {
  BROWSER_SDK_IDENTITY,
  stampReportWithIdentity,
} from "./identity";
import {
  createHandrailBugReporter,
  type BugReporterConfig,
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
  BUG_TRACKING_SORTS,
  BUG_TRACKING_STATUS_GROUPS,
  BUG_REPORT_TOKEN_HEADER,
  BugReporterError,
  HandrailBugReporterClient,
  MAX_SCREENSHOT_BYTES,
  MAX_BUG_HISTORY_SEARCH_CHARACTERS,
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
  BugTrackingListOptions,
  BugTrackingPage,
  BugTrackingQuery,
  BugTrackingSort,
  BugTrackingStage,
  BugTrackingStatusGroup,
  BugTrackingStatusRollup,
  BugTrackingSummary,
  BugReporterTransport,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  RedactionHook,
  ReporterAccessLevel,
  ReporterRetryOptions,
  ScreenshotAttachment,
  SubmissionOptions,
  TrackedBugRecord,
} from "./reporter";

export const SDK_RUNTIME = "browser" as const;
export const SDK_PLATFORM = "browser" as const;
export const SDK_IDENTITY = BROWSER_SDK_IDENTITY;

export function stampReport<T extends Readonly<Record<string, unknown>>>(
  report: T,
) {
  return stampReportWithIdentity(report, SDK_IDENTITY);
}

export function createBugReporter(
  config: BugReporterConfig,
) {
  return createHandrailBugReporter(config, {
    identity: SDK_IDENTITY,
    stamp: stampReport,
  });
}
