import {
  SDK_IDENTITY as browserIdentity,
  stampReport as stampBrowserReport,
  type ReporterSdkIdentity,
} from "@handrail/bug-reporter";
import {
  SDK_IDENTITY as serverIdentity,
  stampReport as stampServerReport,
} from "@handrail/bug-reporter/server";
import {
  HandrailBugReporterIdentityProvider,
  SDK_IDENTITY as reactIdentity,
  stampReport as stampReactReport,
  useHandrailBugReporterIdentity,
} from "@handrail/bug-reporter/react";

const browserReport = stampBrowserReport({ title: "Browser issue" } as const);
const serverReport = stampServerReport({ title: "Server issue" } as const);
const reactReport = stampReactReport({ title: "React issue" } as const);

const browserRuntime: "browser" = browserReport.reporter_sdk_runtime;
const nodeRuntime: "node" = serverReport.reporter_sdk_runtime;
const reactRuntime: "react" = reactReport.reporter_sdk_runtime;
const browserPlatform: "browser" = browserReport.platform;
const serverPlatform: "node" = serverReport.platform;
const packageName: "@handrail/bug-reporter" = reactReport.reporter_sdk_package;
const identities: readonly ReporterSdkIdentity[] = [
  browserIdentity,
  serverIdentity,
  reactIdentity,
];

void browserRuntime;
void nodeRuntime;
void reactRuntime;
void browserPlatform;
void serverPlatform;
void packageName;
void identities;
void HandrailBugReporterIdentityProvider;
void useHandrailBugReporterIdentity;

// @ts-expect-error SDK identity is immutable to consumers.
browserIdentity.reporter_sdk_version = "overridden";
// @ts-expect-error Server reports have a Node platform literal.
const invalidServerPlatform: "browser" = serverReport.platform;
void invalidServerPlatform;
