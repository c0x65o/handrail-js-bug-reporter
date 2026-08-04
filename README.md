# @handrail/bug-reporter

Framework-neutral JavaScript bug-reporting primitives for Handrail. The package
has separate browser, Node/server, and headless React entry points and stamps
reports with immutable SDK release identity.

This repository currently builds the `0.1.0-rc.1` release candidate. It is not
published yet.

## Installation

After the release candidate is published, install the exact version:

```sh
npm install @handrail/bug-reporter@0.1.0-rc.1
```

For local evaluation before publication, build and pack this checkout, then
install the resulting tarball in a test application:

```sh
npm ci
npm run build
npm pack
npm install /path/to/handrail-bug-reporter-0.1.0-rc.1.tgz
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

Server code uses the isolated server entry point:

```ts
import { stampReport } from "@handrail/bug-reporter/server";

const report = stampReport({
  title: "Invoice job failed",
  route: "/jobs/invoices",
});
```

The React entry point is headless. Its provider only exposes immutable SDK
identity; report form and policy state will be added without imposing rendered
UI:

```tsx
import {
  HandrailBugReporterIdentityProvider,
  useHandrailBugReporterIdentity,
} from "@handrail/bug-reporter/react";

function Diagnostics() {
  const identity = useHandrailBugReporterIdentity();
  return <code>{identity.reporter_sdk_version}</code>;
}

function App() {
  return (
    <HandrailBugReporterIdentityProvider>
      <Diagnostics />
    </HandrailBugReporterIdentityProvider>
  );
}
```

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

For local builds, the commit is read from the current Git checkout. The release
ref is an exact Git tag when one exists; otherwise it is the immutable
`commit:<sha>` value. Release automation should provide and verify the intended
commit and immutable tag explicitly:

```sh
HANDRAIL_BUG_REPORTER_SDK_COMMIT="$(git rev-parse HEAD)" \
HANDRAIL_BUG_REPORTER_SDK_REF="refs/tags/v0.1.0-rc.1" \
npm run build
```

The release ref must be an immutable tag or commit reference, never a moving
branch such as `main`. `npm run check` verifies package exports, syntax, type
contracts, browser safety, and stamped metadata. Publishing is intentionally
outside this repository task.
