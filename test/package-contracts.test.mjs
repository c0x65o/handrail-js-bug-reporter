import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import {
  assertReleaseIdentity,
  assertReleaseManifests,
  resolveReleaseRef,
} from "../scripts/release-contract.mjs";

const require = createRequire(import.meta.url);
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const packageLock = JSON.parse(
  await readFile(new URL("../package-lock.json", import.meta.url), "utf8"),
);
const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

const entryPoints = [
  ["@handrail/bug-reporter", "browser", "browser"],
  ["@handrail/bug-reporter/server", "node", "node"],
  ["@handrail/bug-reporter/react", "react", "browser"],
];

test("release manifests and README use the ordinary stable version contract", () => {
  assert.doesNotThrow(() => assertReleaseManifests(packageJson, packageLock));
  assert.match(packageJson.version, /^\d+\.\d+\.\d+$/u);
  assert.equal(
    packageJson.scripts.prepare,
    "npm run build",
    "Git dependencies must build dist before npm packs the checkout",
  );
  assert.match(readme, /exact Git commit approved by Handrail/u);
  assert.doesNotMatch(readme, /release candidate|\brc\.\d+\b/iu);
  assert.doesNotMatch(readme, /0\.1\.NaN/);
});

test("release contracts reject malformed and inconsistent metadata", () => {
  assert.throws(
    () =>
      assertReleaseManifests(
        { ...packageJson, version: "0.1.NaN" },
        packageLock,
      ),
    /valid SemVer/,
  );
  assert.throws(
    () =>
      assertReleaseManifests(packageJson, {
        ...packageLock,
        packages: {
          ...packageLock.packages,
          "": { ...packageLock.packages[""], version: "0.1.NaN" },
        },
      }),
    /must match package\.json/,
  );
  assert.throws(
    () =>
      assertReleaseIdentity(
        {
          commit: "a".repeat(40),
          packageName: packageJson.name,
          packageVersion: "0.1.NaN",
          releaseRef: `commit:${"b".repeat(40)}`,
        },
        packageJson,
      ),
    /must match package\.json/,
  );
  assert.throws(
    () =>
      assertReleaseIdentity(
        {
          commit: "a".repeat(40),
          packageName: packageJson.name,
          packageVersion: packageJson.version,
          releaseRef: `commit:${"b".repeat(40)}`,
        },
        packageJson,
      ),
    /this commit or the canonical version tag/,
  );
  assert.equal(
    resolveReleaseRef({
      commit: "a".repeat(40),
      exactTag: undefined,
      explicitRef: undefined,
      version: packageJson.version,
    }),
    `commit:${"a".repeat(40)}`,
  );
});

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
        cwd: repositoryRoot,
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
      resolveDir: repositoryRoot,
      sourcefile: "browser-consumer.mjs",
    },
    write: false,
  });
  const output = result.outputFiles[0].text;
  assert.doesNotMatch(output, /node:|\bprocess\s*\.|\brequire\s*\(/);
  assert.doesNotMatch(output, /(?:from|import\s*)[ (]*["'](?:fs|path|url|module|child_process)["']/);
});

test("release generation rejects moving branch refs", () => {
  const result = spawnSync(
    process.execPath,
    ["./scripts/generate-release.mjs"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        HANDRAIL_BUG_REPORTER_SDK_REF: "main",
      },
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(
    `${result.stdout}\n${result.stderr}`,
    /this commit or the canonical version tag/,
  );
});

test("metadata is complete, immutable, and authoritative per runtime", async () => {
  const expectedCommit =
    process.env.HANDRAIL_BUG_REPORTER_SDK_COMMIT?.trim() ||
    execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim();
  const exactTagResult = spawnSync(
    "git",
    ["describe", "--exact-match", "--tags", expectedCommit],
    { cwd: repositoryRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  const exactTag =
    exactTagResult.status === 0 ? exactTagResult.stdout.trim() : undefined;
  const expectedRef = resolveReleaseRef({
    commit: expectedCommit,
    exactTag,
    explicitRef: process.env.HANDRAIL_BUG_REPORTER_SDK_REF?.trim() || undefined,
    version: packageJson.version,
  });

  for (const [specifier, runtime, platform] of entryPoints) {
    const loaded = await import(specifier);
    assert.ok(Object.isFrozen(loaded.SDK_IDENTITY));
    assert.equal(loaded.SDK_COMMIT, expectedCommit);
    assert.equal(loaded.SDK_RELEASE_REF, expectedRef);
    assert.doesNotThrow(() =>
      assertReleaseIdentity(
        {
          commit: loaded.SDK_COMMIT,
          packageName: loaded.SDK_NAME,
          packageVersion: loaded.SDK_VERSION,
          releaseRef: loaded.SDK_RELEASE_REF,
        },
        packageJson,
      ),
    );

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
    assert.throws(() => {
      report.reporter_sdk_version = "mutated_after_stamping";
    }, TypeError);
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

test("npm pack contains matching metadata and every public export", () => {
  const packOutput = execFileSync(
    "npm",
    ["pack", "--dry-run", "--json", "--silent"],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  const jsonStart = packOutput.indexOf('[\n  {\n    "id":');
  assert.ok(jsonStart >= 0, "npm pack must emit its JSON manifest after prepare");
  const result = JSON.parse(packOutput.slice(jsonStart))[0];
  assert.equal(result.name, packageJson.name);
  assert.equal(result.version, packageJson.version);
  assert.equal(result.id, `${packageJson.name}@${packageJson.version}`);
  assert.equal(result.filename, `handrail-bug-reporter-${packageJson.version}.tgz`);

  const packedPaths = new Set(result.files.map(({ path }) => path));
  assert.ok(packedPaths.has("package.json"));
  assert.ok(packedPaths.has("README.md"));
  for (const exportValue of Object.values(packageJson.exports).slice(0, 3)) {
    for (const format of ["import", "require"]) {
      assert.ok(
        packedPaths.has(exportValue[format].types.replace(/^\.\//, "")),
      );
      assert.ok(
        packedPaths.has(exportValue[format].default.replace(/^\.\//, "")),
      );
    }
  }
});
