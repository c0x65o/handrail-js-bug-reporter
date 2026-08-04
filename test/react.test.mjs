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

function Harness({ config, onValue, initialForm }) {
  return createElement(
    HandrailBugReporterProvider,
    { config, initialForm },
    createElement(Probe, { onValue }),
  );
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
