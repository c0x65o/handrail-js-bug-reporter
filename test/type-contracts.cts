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
const canonicalImpact: core.BugImpact = "moderate";
const storedSeverity: core.HandrailBugSeverity = "sev3";
const disabledSubmission = reporter.submit({
  title: "CommonJS browser issue",
  description: "Details",
});
const disabledBugHistory = reporter.listBugs({ limit: 10 });
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
void disabledBugHistory;
void requestReporter;
void canonicalImpact;
void storedSeverity;
void react.HandrailBugReporterProvider;
void react.useHandrailBugReporter;
void react.HandrailBugReporterButton;
void react.HandrailBugReporterDialog;

const packagedAppearance: react.HandrailBugReporterAppearance = {
  themeMode: "light",
  tokens: { accent: "#175cd3" },
};
const packagedButtonProps: react.HandrailBugReporterButtonProps = {
  appearance: packagedAppearance,
};
const packagedDialogProps: react.HandrailBugReporterDialogProps = {
  open: true,
  onClose: () => undefined,
};
void packagedButtonProps;
void packagedDialogProps;

const legacyHeadlessInitialForm: Partial<react.BugReporterFormState> = {
  notifyOnResolution: true,
};
void legacyHeadlessInitialForm;
