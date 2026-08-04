import { createContext, createElement, useContext } from "react";
import type { PropsWithChildren, ReactElement } from "react";
import {
  REACT_SDK_IDENTITY,
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
