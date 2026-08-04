import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

const entryPoints = [
  ["@handrail/bug-reporter", "browser", "browser"],
  ["@handrail/bug-reporter/server", "node", "node"],
  ["@handrail/bug-reporter/react", "react", "browser"],
];

test("package exports resolve for ESM and CommonJS", async () => {
  assert.deepEqual(Object.keys(packageJson.exports), [
    ".",
    "./server",
    "./react",
    "./package.json",
  ]);
  assert.equal(packageJson.peerDependencies.react, ">=18 <20");

  for (const [specifier, runtime, platform] of entryPoints) {
    const esm = await import(specifier);
    const cjs = require(specifier);
    for (const loaded of [esm, cjs]) {
      assert.equal(loaded.SDK_NAME, packageJson.name);
      assert.equal(loaded.SDK_VERSION, packageJson.version);
      assert.equal(loaded.SDK_RUNTIME, runtime);
      assert.equal(loaded.SDK_PLATFORM, platform);
      assert.equal(typeof loaded.stampReport, "function");
    }
  }
});

test("all emitted JavaScript has valid syntax", () => {
  for (const exportValue of Object.values(packageJson.exports).slice(0, 3)) {
    for (const format of ["import", "require"]) {
      execFileSync(process.execPath, ["--check", exportValue[format].default], {
        cwd: new URL("..", import.meta.url),
        stdio: "pipe",
      });
    }
  }
});

test("the browser entry bundles without Node runtime dependencies", async () => {
  const result = await build({
    bundle: true,
    format: "esm",
    platform: "browser",
    stdin: {
      contents:
        'import { stampReport } from "@handrail/bug-reporter"; export default stampReport({ title: "test" });',
      resolveDir: new URL("..", import.meta.url).pathname,
      sourcefile: "browser-consumer.mjs",
    },
    write: false,
  });
  const output = result.outputFiles[0].text;
  assert.doesNotMatch(output, /node:|\bprocess\s*\.|\brequire\s*\(/);
  assert.doesNotMatch(output, /(?:from|import\s*)[ (]*["'](?:fs|path|url|module|child_process)["']/);
});

test("metadata is complete, immutable, and authoritative per runtime", async () => {
  for (const [specifier, runtime, platform] of entryPoints) {
    const loaded = await import(specifier);
    assert.ok(Object.isFrozen(loaded.SDK_IDENTITY));
    assert.match(loaded.SDK_COMMIT, /^(?:[0-9a-f]{40}|unknown)$/);
    assert.ok(loaded.SDK_RELEASE_REF.length > 0);

    const input = {
      title: "Example",
      source: "caller_override",
      platform: "caller_override",
      reporter_sdk_package: "caller_override",
      reporter_sdk_version: "999.0.0",
      reporter_sdk_commit: "caller_override",
      reporter_sdk_ref: "caller_override",
      reporter_sdk_runtime: "caller_override",
    };
    const report = loaded.stampReport(input);

    assert.notEqual(report, input);
    assert.equal(input.source, "caller_override");
    assert.deepEqual(report, {
      title: "Example",
      source: "node_web_bug_reporter",
      platform,
      reporter_sdk_runtime: runtime,
      reporter_sdk_package: packageJson.name,
      reporter_sdk_version: packageJson.version,
      reporter_sdk_commit: loaded.SDK_COMMIT,
      reporter_sdk_ref: loaded.SDK_RELEASE_REF,
    });
  }
});
