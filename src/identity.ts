import {
  GENERATED_PACKAGE_COMMIT,
  GENERATED_PACKAGE_NAME,
  GENERATED_PACKAGE_RELEASE_REF,
  GENERATED_PACKAGE_VERSION,
} from "./generated/release";

export const SDK_NAME = GENERATED_PACKAGE_NAME;
export const SDK_VERSION = GENERATED_PACKAGE_VERSION;
export const SDK_COMMIT = GENERATED_PACKAGE_COMMIT;
export const SDK_RELEASE_REF = GENERATED_PACKAGE_RELEASE_REF;
export const REPORT_SOURCE = "node_web_bug_reporter" as const;

export type ReporterRuntime = "browser" | "node" | "react";
export type ReporterPlatform = "browser" | "node";

export interface ReporterSdkIdentity<
  Runtime extends ReporterRuntime = ReporterRuntime,
  Platform extends ReporterPlatform = ReporterPlatform,
> {
  readonly source: typeof REPORT_SOURCE;
  readonly platform: Platform;
  readonly reporter_sdk_runtime: Runtime;
  readonly reporter_sdk_package: typeof SDK_NAME;
  readonly reporter_sdk_version: typeof SDK_VERSION;
  readonly reporter_sdk_commit: typeof SDK_COMMIT;
  readonly reporter_sdk_ref: typeof SDK_RELEASE_REF;
}

export type StampedBugReport<
  T extends Readonly<Record<string, unknown>>,
  Identity extends ReporterSdkIdentity = ReporterSdkIdentity,
> = Omit<T, keyof ReporterSdkIdentity> & Identity;

function sdkIdentity<
  const Runtime extends ReporterRuntime,
  const Platform extends ReporterPlatform,
>(runtime: Runtime, platform: Platform): ReporterSdkIdentity<Runtime, Platform> {
  return Object.freeze({
    source: REPORT_SOURCE,
    platform,
    reporter_sdk_runtime: runtime,
    reporter_sdk_package: SDK_NAME,
    reporter_sdk_version: SDK_VERSION,
    reporter_sdk_commit: SDK_COMMIT,
    reporter_sdk_ref: SDK_RELEASE_REF,
  });
}

export const BROWSER_SDK_IDENTITY = sdkIdentity("browser", "browser");
export const SERVER_SDK_IDENTITY = sdkIdentity("node", "node");
export const REACT_SDK_IDENTITY = sdkIdentity("react", "browser");

export function stampReportWithIdentity<
  T extends Readonly<Record<string, unknown>>,
  const Identity extends ReporterSdkIdentity,
>(report: T, identity: Identity): StampedBugReport<T, Identity> {
  const stamped = { ...report } as StampedBugReport<T, Identity>;
  for (const [key, value] of Object.entries(identity)) {
    Object.defineProperty(stamped, key, {
      configurable: false,
      enumerable: true,
      value,
      writable: false,
    });
  }
  return stamped;
}
