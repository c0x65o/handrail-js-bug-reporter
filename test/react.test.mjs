import assert from "node:assert/strict";
import { test } from "node:test";

// The worker may install dependencies with NODE_ENV=production. Load React's
// test build explicitly without changing the package's runtime behavior.
process.env.NODE_ENV = "test";
const { createElement } = await import("react");
const { act, create } = await import("react-test-renderer");
const {
  HandrailBugReporterProvider,
  useHandrailBugReporter,
} = await import("@handrail/bug-reporter/react");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const policy = {
  schema_version: 1,
  project_id: "project-123",
  environment: "staging",
  reporter: { identity_verified: true, access_level: "full_access" },
  ask_options: [
    { key: "auto_verify", label: "Verify" },
    { key: "fix", label: "Fix" },
  ],
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function Harness({ config, onValue, initialForm, ...providerProps }) {
  return createElement(
    HandrailBugReporterProvider,
    { config, initialForm, ...providerProps },
    createElement(Probe, { onValue }),
  );
}

function trackedBug(id, stage = "submitted") {
  return {
    id,
    title: `Bug ${id}`,
    severity: "sev3",
    environment: "staging",
    status: stage === "submitted" ? "reported" : "in_progress",
    status_rollup: {
      stage,
      label: stage === "submitted" ? "Submitted" : "Fix in progress",
      terminal: false,
      raw_status: stage === "submitted" ? "reported" : "in_progress",
      workflow_state: stage === "submitted" ? "reported" : "fixing",
      environment: null,
      version: null,
      updated_at: "2026-08-13T18:00:00.000Z",
    },
    occurrence_count: 1,
    reporter_occurrence_count: 1,
    first_reported_at: "2026-08-13T18:00:00.000Z",
    last_reported_at: "2026-08-13T18:00:00.000Z",
    created_at: "2026-08-13T18:00:00.000Z",
    updated_at: "2026-08-13T18:00:00.000Z",
    fixed_at: null,
    closed_at: null,
  };
}

function Probe({ onValue }) {
  onValue(useHandrailBugReporter());
  return null;
}

test("headless React controls are policy-derived and submit through the core payload path", async () => {
  const requests = [];
  const config = {
    apiBaseUrl: "https://handrail.example/api",
    projectId: "project-123",
    environment: "staging",
    reportToken: "public-token",
    applicationSessionTokenProvider: () => "react-session",
    allowScreenshots: true,
    fetch: async (_url, init) => {
      requests.push(init);
      return init.method === "GET"
        ? jsonResponse(policy)
        : jsonResponse({ bug_id: "react-bug" }, 201);
    },
  };
  let value;
  let renderer;
  await act(async () => {
    renderer = create(
      createElement(Harness, {
        config,
        initialForm: {
          title: "React issue",
          description: "Headless form submission",
          route: "/react",
        },
        onValue: (next) => {
          value = next;
        },
      }),
    );
  });

  assert.equal(value.policyStatus, "ready");
  assert.equal(value.isVanilla, false);
  assert.equal(value.canAttachScreenshot, true);
  assert.deepEqual(
    value.automationOptions.map((option) => option.key),
    ["auto_verify", "fix"],
  );
  await act(async () => {
    value.setAutomationRequest("fix", true);
    value.setAutomationRequest("deploy_production", true);
    value.replaceScreenshot({
      data: new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]),
      mimeType: "image/png",
      filename: "react.png",
    });
  });
  assert.deepEqual(value.form.automationRequests, ["fix"]);
  assert.equal(value.form.screenshot.filename, "react.png");
  await act(async () => {
    value.removeScreenshot();
    value.updateForm({ description: "Updated without rendered UI" });
  });
  assert.equal(value.form.screenshot, null);

  await act(async () => {
    await value.submit();
  });
  assert.equal(value.submission.status, "submitted");
  const body = JSON.parse(requests.at(-1).body);
  assert.equal(body.title, "React issue");
  assert.equal(body.description, "Updated without rendered UI");
  assert.equal(body.route, "/react");
  assert.deepEqual(body.automation_requests, { fix: true });
  assert.equal(body.reporter_sdk_runtime, "react");
  assert.equal(body.screenshot_base64, undefined);

  await act(async () => renderer.unmount());
});

test("headless React remains operational without policy or application identity", async () => {
  let submitted;
  const config = {
    apiBaseUrl: "https://handrail.example/api",
    projectId: "project-123",
    environment: "staging",
    reportToken: "public-token",
    fetch: async (_url, init) => {
      if (init.method === "GET") {
        return jsonResponse({
          ...policy,
          reporter: { identity_verified: false, access_level: "default" },
        });
      }
      submitted = init;
      return jsonResponse({ bug_id: "vanilla-react" }, 201);
    },
  };
  let value;
  let renderer;
  await act(async () => {
    renderer = create(
      createElement(Harness, {
        config,
        initialForm: {
          title: "Vanilla React",
          description: "Identity unavailable",
          automationRequests: ["fix"],
        },
        onValue: (next) => {
          value = next;
        },
      }),
    );
  });
  assert.equal(value.policy, null);
  assert.equal(value.policyStatus, "unavailable");
  assert.equal(value.isVanilla, true);
  assert.deepEqual(value.automationOptions, []);
  assert.deepEqual(value.form.automationRequests, []);

  await act(async () => {
    await value.submit();
  });
  assert.equal(value.submission.status, "submitted");
  assert.equal(JSON.parse(submitted.body).automation_requests, undefined);
  assert.equal(
    submitted.headers["x-handrail-application-session-token"],
    undefined,
  );
  await act(async () => renderer.unmount());
});

test("headless React refreshes and appends bounded bug history pages", async () => {
  const historyUrls = [];
  const config = {
    apiBaseUrl: "https://handrail.example/api",
    projectId: "project-123",
    environment: "staging",
    reportToken: "public-token",
    applicationSessionTokenProvider: () => "history-session",
    fetch: async (url) => {
      historyUrls.push(String(url));
      const secondPage = String(url).includes("cursor=page-2");
      return jsonResponse({
        contract_version: "v1",
        bugs: secondPage
          ? [trackedBug("bug-2", "fixing")]
          : [trackedBug("bug-1")],
        summary: {
          total: 2,
          needs_attention: 0,
          in_progress: 2,
          closed: 0,
          not_reproduced: 0,
        },
        query: {
          search: "checkout",
          status_group: "in_progress",
          sort: "newest",
        },
        pagination: {
          limit: 1,
          filtered_count: 2,
          has_more: !secondPage,
          next_cursor: secondPage ? null : "page-2",
        },
      });
    },
  };
  let value;
  let renderer;
  await act(async () => {
    renderer = create(createElement(Harness, {
      config,
      loadPolicyOnMount: false,
      historyPageSize: 1,
      onValue: (next) => {
        value = next;
      },
    }));
  });
  assert.equal(value.tracking.status, "idle");

  await act(async () => {
    await value.refreshBugs({
      search: "checkout",
      statusGroup: "in_progress",
      sort: "newest",
    });
  });
  assert.equal(value.tracking.status, "ready");
  assert.deepEqual(value.tracking.bugs.map((bug) => bug.id), ["bug-1"]);
  assert.equal(value.tracking.hasMore, true);
  assert.equal(value.tracking.summary.total, 2);
  assert.deepEqual(value.tracking.query, {
    search: "checkout",
    statusGroup: "in_progress",
    sort: "newest",
  });

  await act(async () => {
    await value.loadMoreBugs();
  });
  assert.deepEqual(
    value.tracking.bugs.map((bug) => [bug.id, bug.status_rollup.stage]),
    [["bug-1", "submitted"], ["bug-2", "fixing"]],
  );
  assert.equal(value.tracking.hasMore, false);
  assert.match(historyUrls[0], /limit=1/);
  assert.match(historyUrls[0], /search=checkout/);
  assert.match(historyUrls[0], /status_group=in_progress/);
  assert.match(historyUrls[0], /sort=newest/);
  assert.match(historyUrls[1], /cursor=page-2/);

  await act(async () => renderer.unmount());
});

test("headless React leaves loading state when optional-action discovery stalls", async () => {
  const config = {
    apiBaseUrl: "https://handrail.example/api",
    projectId: "project-123",
    environment: "staging",
    reportToken: "public-token",
    policyDiscoveryTimeoutMs: 20,
    fetch: async () => new Promise(() => {}),
  };
  let value;
  let renderer;
  await act(async () => {
    renderer = create(
      createElement(Harness, {
        config,
        onValue: (next) => {
          value = next;
        },
      }),
    );
  });
  assert.equal(value.policyStatus, "loading");
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
  });

  assert.equal(value.policy, null);
  assert.equal(value.policyStatus, "unavailable");
  assert.equal(value.isVanilla, true);
  assert.deepEqual(value.automationOptions, []);
  await act(async () => renderer.unmount());
});

test("a late mount lookup cannot overwrite a newer manual policy refresh", async () => {
  const pendingResponses = [];
  const config = {
    apiBaseUrl: "https://handrail.example/api",
    projectId: "project-123",
    environment: "staging",
    reportToken: "public-token",
    fetch: async () =>
      new Promise((resolve) => {
        pendingResponses.push(resolve);
      }),
  };
  let value;
  let renderer;
  await act(async () => {
    renderer = create(
      createElement(Harness, {
        config,
        onValue: (next) => {
          value = next;
        },
      }),
    );
  });
  assert.equal(pendingResponses.length, 1);

  let refresh;
  await act(async () => {
    refresh = value.refreshPolicy();
    await new Promise((resolve) => setImmediate(resolve));
  });
  assert.equal(pendingResponses.length, 2);

  await act(async () => {
    pendingResponses[1](jsonResponse(policy));
    await refresh;
  });
  assert.equal(value.policyStatus, "ready");
  assert.deepEqual(
    value.automationOptions.map((option) => option.key),
    ["auto_verify", "fix"],
  );

  await act(async () => {
    pendingResponses[0](
      jsonResponse({
        ...policy,
        reporter: { identity_verified: false, access_level: "default" },
        ask_options: [],
      }),
    );
    await new Promise((resolve) => setImmediate(resolve));
  });
  assert.equal(value.policyStatus, "ready");
  assert.deepEqual(
    value.automationOptions.map((option) => option.key),
    ["auto_verify", "fix"],
  );

  await act(async () => renderer.unmount());
});
