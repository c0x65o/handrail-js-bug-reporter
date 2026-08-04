const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

const FULL_COMMIT_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

export function resolveReleaseCommit(...candidates) {
  for (const candidate of candidates) {
    const value = typeof candidate === "string" ? candidate.trim() : "";
    if (!value) continue;
    if (FULL_COMMIT_PATTERN.test(value)) return value.toLowerCase();

    const match = value.match(
      /(?:#|commit:)((?:[0-9a-f]{40}|[0-9a-f]{64}))(?:$|[?&])/iu,
    );
    if (match) return match[1].toLowerCase();
  }
  return undefined;
}

export function assertReleaseManifests(packageJson, packageLock) {
  if (!packageJson || typeof packageJson.name !== "string" || !packageJson.name) {
    throw new Error("package.json must contain a package name.");
  }
  if (
    typeof packageJson.version !== "string" ||
    !SEMVER_PATTERN.test(packageJson.version)
  ) {
    throw new Error(
      `package.json version must be valid SemVer; received ${JSON.stringify(packageJson?.version)}.`,
    );
  }

  const lockedPackage = packageLock?.packages?.[""];
  if (
    packageLock?.name !== packageJson.name ||
    lockedPackage?.name !== packageJson.name ||
    packageLock?.version !== packageJson.version ||
    lockedPackage?.version !== packageJson.version
  ) {
    throw new Error(
      "package-lock.json root package name and version must match package.json.",
    );
  }
}

export function resolveReleaseRef({ commit, exactTag, explicitRef, version }) {
  return (
    explicitRef ??
    (exactTag === `v${version}` ? `refs/tags/${exactTag}` : undefined) ??
    (FULL_COMMIT_PATTERN.test(commit) ? `commit:${commit}` : undefined) ??
    `refs/tags/v${version}`
  );
}

export function assertReleaseIdentity(identity, packageJson) {
  if (identity.commit && !FULL_COMMIT_PATTERN.test(identity.commit)) {
    throw new Error(
      "Generated release commit must be a full Git commit when present.",
    );
  }
  if (
    identity.packageName !== packageJson.name ||
    identity.packageVersion !== packageJson.version
  ) {
    throw new Error("Generated release package metadata must match package.json.");
  }

  const canonicalTags = new Set([
    packageJson.version,
    `v${packageJson.version}`,
    `refs/tags/v${packageJson.version}`,
  ]);
  const commitRef = identity.releaseRef.match(/^commit:(.+)$/i);
  const rawCommitRef = FULL_COMMIT_PATTERN.test(identity.releaseRef);
  const consistentCommitRef =
    Boolean(identity.commit) && (
      commitRef?.[1]?.toLowerCase() === identity.commit.toLowerCase() ||
      (rawCommitRef && identity.releaseRef.toLowerCase() === identity.commit.toLowerCase())
    );

  if (!consistentCommitRef && !canonicalTags.has(identity.releaseRef)) {
    throw new Error(
      `HANDRAIL_BUG_REPORTER_SDK_REF must identify this commit or the canonical version tag; received ${JSON.stringify(identity.releaseRef)}.`,
    );
  }
}
