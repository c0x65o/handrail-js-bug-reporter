import core = require("@handrail/bug-reporter");
import server = require("@handrail/bug-reporter/server");
import react = require("@handrail/bug-reporter/react");

const browserRuntime: "browser" = core.SDK_IDENTITY.reporter_sdk_runtime;
const nodeRuntime: "node" = server.stampReport({
  title: "CommonJS server issue",
}).reporter_sdk_runtime;
const reactRuntime: "react" = react.SDK_IDENTITY.reporter_sdk_runtime;
const reporter = core.createBugReporter({
  enabled: false,
});
const disabledSubmission = reporter.submit({
  title: "CommonJS browser issue",
  description: "Details",
});
const requestReporters = server.createRequestScopedBugReporter({
  enabled: false,
  resolveApplicationSessionToken: (request: { session?: string }) =>
    request.session,
});
const requestReporter = requestReporters.forRequest({ session: "fresh" });

void browserRuntime;
void nodeRuntime;
void reactRuntime;
void disabledSubmission;
void requestReporter;
void react.HandrailBugReporterProvider;
void react.useHandrailBugReporter;
