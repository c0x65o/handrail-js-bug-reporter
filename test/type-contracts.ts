import {
  SDK_IDENTITY as browserIdentity,
  createBugReporter,
  stampReport as stampBrowserReport,
  type BugReporterPolicy,
  type ReporterSdkIdentity,
} from "@handrail/bug-reporter";
import {
  SDK_IDENTITY as serverIdentity,
  createRequestScopedBugReporter,
  createSameOriginBugReporterHandler,
  stampReport as stampServerReport,
} from "@handrail/bug-reporter/server";
import {
  HandrailBugReporterProvider,
  HandrailBugReporterIdentityProvider,
  SDK_IDENTITY as reactIdentity,
  stampReport as stampReactReport,
  useHandrailBugReporter,
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
void HandrailBugReporterProvider;
void useHandrailBugReporter;

type AppRequest = { readonly applicationSessionToken?: string };
const requestReporters = createRequestScopedBugReporter<AppRequest>({
  apiBaseUrl: "https://handrail.example/api",
  projectId: "project-123",
  environment: "staging",
  reportToken: "server-only-token",
  resolveApplicationSessionToken: (request) =>
    request.applicationSessionToken,
});
const requestReporter = requestReporters.forRequest({
  applicationSessionToken: "fresh-request-session",
});
void requestReporter;

const sameOriginHandler = createSameOriginBugReporterHandler({
  apiBaseUrl: "https://handrail.example/api",
  projectId: "project-123",
  environment: "staging",
  reportToken: "server-only-token",
  resolveApplicationSessionToken: (request) =>
    request.headers.get("x-app-session"),
});
const forwardedResponse: Promise<Response> = sameOriginHandler(
  new Request("https://app.example/api/mobile-bug-reports/policy"),
);
void forwardedResponse;

const reporter = createBugReporter({
  apiBaseUrl: "/api",
  projectId: "project-123",
  environment: "staging",
  reportToken: "public-token",
  applicationSessionTokenProvider: async () => "current-session",
  allowScreenshots: true,
});
const policyPromise: Promise<BugReporterPolicy | null> = reporter.loadPolicy();
const submissionPromise = reporter.submit(
  {
    title: "Browser issue",
    description: "The button did not respond.",
    screenshot: {
      data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      mimeType: "image/png",
    },
  },
  { automationRequests: ["auto_verify", "fix"] },
);
void policyPromise;
void submissionPromise;

const sameOriginReporter = createBugReporter({
  apiBaseUrl: "/api",
  projectId: "project-123",
  environment: "staging",
  transport: "same-origin",
});
void sameOriginReporter;

// @ts-expect-error SDK identity is immutable to consumers.
browserIdentity.reporter_sdk_version = "overridden";
// @ts-expect-error Server reports have a Node platform literal.
const invalidServerPlatform: "browser" = serverReport.platform;
void invalidServerPlatform;
// @ts-expect-error GIF screenshots are not accepted by the SDK contract.
reporter.submit({ title: "x", description: "y", screenshot: { data: "", mimeType: "image/gif" } });
