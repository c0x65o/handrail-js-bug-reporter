# @handrail/bug-reporter

Framework-neutral JavaScript bug-reporting primitives for Handrail. The package
has separate browser, Node/server, and headless React entry points and stamps
reports with immutable SDK release identity.

## Installation

This public SDK is distributed from its GitHub repository in the same exact-pin
model as Handrail's other SDKs. Applications should use the Git commit approved
by Handrail's JavaScript bug reporter install contract, never a moving branch
such as `main`.

For local evaluation, build and pack this checkout, then install the resulting
tarball in a test application:

```sh
npm ci
npm run build
npm pack
npm install ./handrail-bug-reporter-*.tgz
```

React applications must already provide React 18 or newer. React is a peer
dependency so this package never installs a second React runtime.

## Entry points

The root entry point is browser-safe and has no Node built-in, `process`, or
filesystem dependency:

```ts
import { stampReport } from "@handrail/bug-reporter";

const report = stampReport({
  title: "Checkout button does not respond",
  description: "Clicking Continue has no visible effect.",
});
```

It also provides policy discovery and JSON submission against Handrail's
existing bug-report intake:

```ts
import { createBugReporter } from "@handrail/bug-reporter";

const reporter = createBugReporter({
  apiBaseUrl: "https://dashboard.handrail-daas.com/api",
  projectId: "your-immutable-project-id",
  environment: "staging",
  reportToken: "your-public-report-token",
  applicationSessionTokenProvider: async () =>
    applicationAuth.currentSession?.rawToken ?? null,
});

// Best effort. A null result means the UI should show only vanilla reporting.
const policy = await reporter.discoverPolicy();

await reporter.submit(
  {
    title: "Checkout button does not respond",
    description: "Clicking Continue has no visible effect.",
    route: window.location.pathname,
    metadata: { viewport: `${window.innerWidth}x${window.innerHeight}` },
  },
  {
    // Render and select keys only from policy?.askOptions.
    automationRequests: policy?.askOptions.map((option) => option.key),
  },
);
```

The direct browser provider example applies only when the application already
exposes a browser-readable session token. Use the same-origin forwarding
pattern below for HttpOnly cookies; never weaken an HttpOnly session to satisfy
this API.

`apiBaseUrl` accepts a Handrail origin such as
`https://dashboard.handrail-daas.com`, an API base ending in `/api`, a
same-origin `/api` path, or the complete `/api/mobile-bug-reports` endpoint.
All forms normalize to the existing intake and `/policy` routes without
duplicating `/api`.

Create an explicitly disabled, no-network reporter with
`createBugReporter({ enabled: false })`. Its configuration status is
`disabled`, policy discovery returns `null`, and submission returns
`{ status: "disabled" }`. An enabled reporter with incomplete or invalid
configuration has `configuration.status === "misconfigured"`; it makes no
request and submission throws a generic `BugReporterError`.

### Identity and policy safety

`applicationSessionTokenProvider` is invoked immediately before every policy
or submission request, including each retry. Its current non-blank result is
sent only in `x-handrail-application-session-token`. The SDK never adds it to a
payload, configuration snapshot, stored policy, retry body, error, log,
storage, or analytics event. If the provider is missing, returns no session,
or throws, ordinary bug reporting continues without verified attribution.

Policy discovery is best effort and never downloads Known Users. The SDK
accepts only a version-1 response for the configured project and environment
whose reporter identity is server-verified. It ignores unknown automation
keys and uses this fixed allowlist:

- `auto_verify`
- `repair_proposal`
- `fix`
- `deploy_staging`
- `deploy_production`

Policy discovery falls back to vanilla reporting after five seconds by
default, so a stalled application-session resolver or policy endpoint cannot
leave optional-action controls loading indefinitely. Override the bounded
deadline with `policyDiscoveryTimeoutMs`; it applies only to policy discovery,
not report submission.

Submission intersects caller selections with the most recently verified
policy response. When there is no verified current policy or no current
session at submission time, it omits `automation_requests` and submits a
vanilla report. Handrail remains the authority that re-verifies identity,
classifies risk, and applies workflow and deployment gates.

### Redaction, screenshots, retries, and errors

The SDK recursively replaces values under sensitive keys such as tokens,
cookies, authorization, passwords, credentials, session data, private keys,
and payment-card fields with `[REDACTED]`. Add application-specific hooks with
`redactionHooks`; each hook receives an already-sanitized JSON report and must
return the complete report. Built-in redaction runs again after every hook so
a hook cannot accidentally reintroduce a sensitive-key value.

Screenshots are disabled unless `allowScreenshots: true` is configured. A
report can then include one `screenshot` as a `Blob`, `ArrayBuffer`, typed
array, base64 string, or data URL. The SDK accepts only signature-matching
`image/png` and `image/jpeg`, strips unsafe filename characters, and rejects
decoded data larger than Handrail intake's 20 MiB limit before making a
request:

```ts
await reporter.submit({
  title: "Layout overlaps",
  description: "The controls overlap at tablet width.",
  screenshot: {
    data: pastedImageFile,
    mimeType: "image/png",
    filename: "checkout-layout.png",
  },
});
```

Retries are opt-in through `retry.maxAttempts` (maximum 3). The SDK retries
network failures and transient HTTP statuses, re-resolves the application
session for every attempt, and reuses an intake `event_id` so a response-loss
retry remains idempotent. Retry bodies never contain the application session.
The primary `BugReporterError.message` remains generic and never includes
provider exceptions, response bodies, request data, tokens, or screenshots.
For a rejected HTTP submission, callers may also use `statusCode`,
`upstreamCode`, `upstreamMessage`, and `requestId`. The upstream message is a
bounded Handrail diagnostic with the report token and current application
session token redacted; it is intended for server-side logging or deliberate
application error mapping rather than automatic rendering. Non-JSON and
malformed response bodies are discarded.

Server code uses the isolated server entry point:

```ts
import { createRequestScopedBugReporter } from "@handrail/bug-reporter/server";

const requestReporters = createRequestScopedBugReporter<AppRequest>({
  apiBaseUrl: process.env.HANDRAIL_API_URL,
  projectId: process.env.HANDRAIL_PROJECT_ID,
  environment: process.env.APP_ENVIRONMENT,
  reportToken: process.env.HANDRAIL_BUG_REPORT_TOKEN,
  // Authenticate the request using the application's normal server code.
  // Return only the current Handrail application-session token.
  resolveApplicationSessionToken: async (request) =>
    (await authenticate(request))?.applicationSessionToken ?? null,
});

export async function reportServerIssue(request: AppRequest) {
  // Construct this client inside the request. No identity is cached globally.
  return requestReporters.forRequest(request).submit({
    title: "Invoice job failed",
    description: "The invoice worker stopped before delivery.",
    route: "/jobs/invoices",
  });
}
```

The resolver runs immediately before every Handrail policy/submission attempt.
The factory retains neither its result nor a prior request, so a long-lived
factory is safe while every returned reporter remains request-local. If the
resolver returns nothing or throws, submission continues as a vanilla report.

### HttpOnly sessions and same-origin forwarding

When the application session is held in an HttpOnly cookie, browser JavaScript
must not read or copy it. Mount a Web `Request`/`Response` forwarding handler
on the application server at `/api/mobile-bug-reports` and its `/policy` child:

```ts
import {
  createSameOriginBugReporterHandler,
} from "@handrail/bug-reporter/server";

export const handleBugReport = createSameOriginBugReporterHandler({
  apiBaseUrl: process.env.HANDRAIL_API_URL,
  projectId: process.env.HANDRAIL_PROJECT_ID,
  environment: process.env.APP_ENVIRONMENT,
  reportToken: process.env.HANDRAIL_BUG_REPORT_TOKEN,
  resolveApplicationSessionToken: async (request) =>
    (await authenticateHttpOnlyCookie(request))?.applicationSessionToken ?? null,
});
```

Adapt the framework's incoming request to a Web `Request` if necessary and
return the handler's Web `Response`. The handler ignores inbound cookies,
authorization, report-token, and application-session headers when contacting
Handrail. It resolves identity from that one request, adds server-owned headers
upstream, and returns only a narrow JSON response. Server errors are generic.

The corresponding browser configuration contains no report or session token:

```ts
const reporter = createBugReporter({
  apiBaseUrl: "/api",
  projectId: "your-immutable-project-id",
  environment: "staging",
  transport: "same-origin",
});
```

Same-origin mode accepts only an absolute-path `apiBaseUrl`, sends credentials
with same-origin semantics, and is deliberately misconfigured if a report
token or application-session provider is placed in browser configuration.

### Headless React adoption

The React entry point owns state but renders no UI. Keep its configuration
object stable so the provider represents one reporter instance:

```tsx
import { useMemo } from "react";
import {
  HandrailBugReporterProvider,
  useHandrailBugReporter,
} from "@handrail/bug-reporter/react";

function BugReportForm() {
  const bugReport = useHandrailBugReporter();

  // Bind these headless values/actions to the application's own components:
  // bugReport.form / setForm / updateForm
  // bugReport.policyStatus / isVanilla / automationOptions
  // bugReport.setAutomationRequest
  // bugReport.replaceScreenshot / removeScreenshot / canAttachScreenshot
  // bugReport.submission / submit / resetSubmission
  return null;
}

function App() {
  const bugReporterConfig = useMemo(() => ({
    apiBaseUrl: "/api",
    projectId: "your-immutable-project-id",
    environment: "staging",
    transport: "same-origin" as const,
    allowScreenshots: true,
  }), []);

  return (
    <HandrailBugReporterProvider
      config={bugReporterConfig}
      initialForm={{ route: window.location.pathname }}
    >
      <BugReportForm />
    </HandrailBugReporterProvider>
  );
}
```

Policy-derived automation controls are empty unless the current response is
verified and allowlisted. Screenshot replacement always holds at most one
attachment. When policy or identity is unavailable, `isVanilla` is true,
automation selections are cleared, and the same `submit` action still sends a
vanilla report. The provider installs no global event listeners and uses no
cookies, local storage, session storage, analytics, or background persistence.

Every stamped report includes authoritative values for:

- `source` (`node_web_bug_reporter`)
- `platform` (`browser` or `node`)
- `reporter_sdk_runtime` (`browser`, `node`, or `react`)
- `reporter_sdk_package` (`@handrail/bug-reporter`)
- `reporter_sdk_version`
- `reporter_sdk_commit`
- `reporter_sdk_ref`

Caller-provided values cannot override these fields. Stamping returns a new
object and does not mutate the caller's report.

Both ESM (`import`) and CommonJS (`require`) consumers are supported. TypeScript
declarations are published for every entry point.

## Release stamping

`package.json` is the sole owner of the package name and version. The build
generates a source module containing literal release values and bundles those
literals into every runtime entry point. Runtime modules never inspect
`package.json`, Git, environment variables, `process`, or the filesystem.

For builds in a Git checkout, the commit is read automatically. Public Git
installs can build without `.git`; in that case the SDK stamps its stable version
tag while the consuming application's lockfile owns the exact commit. No
release-candidate or alternate version flow is used.

The release ref must be an immutable tag or commit reference, never a moving
branch such as `main`. `npm run check` verifies package and lockfile version
agreement, package exports, syntax, type contracts, browser safety, stamped
metadata, and packed contents. Publishing is intentionally outside this
repository task.
