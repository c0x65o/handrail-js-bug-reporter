import {
  BROWSER_SDK_IDENTITY,
  stampReportWithIdentity,
} from "./identity";

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

export const SDK_RUNTIME = "browser" as const;
export const SDK_PLATFORM = "browser" as const;
export const SDK_IDENTITY = BROWSER_SDK_IDENTITY;

export function stampReport<T extends Readonly<Record<string, unknown>>>(
  report: T,
) {
  return stampReportWithIdentity(report, SDK_IDENTITY);
}
