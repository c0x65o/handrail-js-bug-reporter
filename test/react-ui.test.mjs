import assert from "node:assert/strict";
import { test } from "node:test";

process.env.NODE_ENV = "test";
const { createElement } = await import("react");
const { act, create } = await import("react-test-renderer");
const {
  HandrailBugReporterButton,
  HandrailBugReporterDialog,
  HandrailBugReporterProvider,
} = await import("@handrail/bug-reporter/react");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const reporterPolicy = {
  schema_version: 1,
  project_id: "project-123",
  environment: "staging",
  reporter: { identity_verified: true, access_level: "full_access" },
  ask_options: [{ key: "fix", label: "Fix" }],
  reporter_notifications: {
    available: true,
    recipient_hint: "j***@example.com",
    lifecycles: ["fixed"],
  },
};

function config(fetch, extra = {}) {
  return {
    apiBaseUrl: "https://handrail.example/api",
    projectId: "project-123",
    environment: "staging",
    reportToken: "public-token",
    applicationSessionTokenProvider: () => "current-session",
    allowScreenshots: true,
    fetch,
    ...extra,
  };
}

function renderInsideProvider(child, providerProps = {}) {
  return createElement(
    HandrailBugReporterProvider,
    {
      config: config(async () => jsonResponse(reporterPolicy)),
      loadPolicyOnMount: false,
      ...providerProps,
    },
    child,
  );
}

function trackedBug(id, archived = false) {
  return {
    id,
    title: `Bug ${id}`,
    severity: "sev3",
    environment: "staging",
    status: "reported",
    status_group: "in_progress",
    reported_app_version: "1.2.3",
    reported_app_flavor: null,
    reported_route: "/checkout",
    status_rollup: {
      stage: "submitted",
      label: "Submitted",
      terminal: false,
      raw_status: "reported",
      workflow_state: "reported",
      environment: null,
      version: null,
      updated_at: "2026-08-13T18:00:00.000Z",
    },
    archived,
    archived_at: archived ? "2026-08-14T18:00:00.000Z" : null,
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

test("the packaged UI is opt-in and the launcher mounts a separate dialog", async () => {
  let renderer;
  await act(async () => {
    renderer = create(renderInsideProvider(
      createElement(HandrailBugReporterButton, { label: "Send bug" }),
    ));
  });

  assert.equal(renderer.root.findAllByProps({ role: "dialog" }).length, 0);
  const launcher = renderer.root.findByProps({ "aria-haspopup": "dialog" });
  assert.equal(launcher.props["aria-expanded"], false);

  await act(async () => launcher.props.onClick());
  assert.equal(renderer.root.findAllByProps({ role: "dialog" }).length, 1);
  assert.equal(renderer.root.findByProps({ "aria-haspopup": "dialog" }).props["aria-expanded"], true);
  const overlay = renderer.root.findByProps({ "data-handrail-bug-reporter": "overlay" });
  assert.equal(overlay.props["data-theme"], "auto");
  assert.equal(overlay.props.style.colorScheme, "inherit");
  assert.equal(overlay.props.style["--handrail-bug-accent"], "light-dark(#2563eb, #78a9ff)");
  assert.match(overlay.props.style["--handrail-bug-font-family"], /Segoe UI/u);

  await act(async () => renderer.root.findByProps({ "aria-label": "Close bug reporter" }).props.onClick());
  assert.equal(renderer.root.findAllByProps({ role: "dialog" }).length, 0);
  await act(async () => renderer.unmount());
});

test("appearance tokens, dialog semantics, focus containment, Escape, and focus restoration are wired", async () => {
  const originals = {
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  };
  let fakeDocument;
  class MockElement {
    constructor(name) {
      this.name = name;
      this.attributes = new Map();
    }
    focus() {
      fakeDocument.activeElement = this;
    }
    getAttribute(name) {
      return this.attributes.get(name) || null;
    }
  }
  const previous = new MockElement("previous");
  const first = new MockElement("first");
  const last = new MockElement("last");
  const dialogNode = new MockElement("dialog");
  dialogNode.querySelector = () => first;
  dialogNode.querySelectorAll = () => [first, last];
  fakeDocument = { activeElement: previous };
  globalThis.document = fakeDocument;
  globalThis.HTMLElement = MockElement;
  globalThis.requestAnimationFrame = (callback) => {
    callback(0);
    return 1;
  };
  globalThis.cancelAnimationFrame = () => undefined;

  let closed = 0;
  let renderer;
  try {
    await act(async () => {
      renderer = create(
        renderInsideProvider(createElement(HandrailBugReporterDialog, {
          open: true,
          onClose: () => { closed += 1; },
          appearance: {
            themeMode: "dark",
            tokens: { accent: "#ff00aa", radius: "4px" },
          },
        })),
        { createNodeMock: (element) => element.type === "section" ? dialogNode : new MockElement(String(element.type)) },
      );
    });

    const overlay = renderer.root.findByProps({ "data-handrail-bug-reporter": "overlay" });
    assert.equal(overlay.props["data-theme"], "dark");
    assert.equal(overlay.props.style["--handrail-bug-accent"], "#ff00aa");
    assert.equal(overlay.props.style["--handrail-bug-radius"], "4px");
    assert.equal(overlay.props.style.colorScheme, "dark");

    const dialog = renderer.root.findByProps({ role: "dialog" });
    assert.equal(dialog.props["aria-modal"], "true");
    assert.ok(dialog.props["aria-labelledby"]);
    assert.ok(dialog.props["aria-describedby"]);
    assert.equal(dialog.props.style.width, "min(720px, calc(100vw - 28px))");
    assert.equal(dialog.props.style.height, "min(780px, calc(100dvh - 28px))");
    assert.equal(fakeDocument.activeElement, first);

    let prevented = false;
    fakeDocument.activeElement = last;
    dialog.props.onKeyDown({ key: "Tab", shiftKey: false, preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(fakeDocument.activeElement, first);

    prevented = false;
    fakeDocument.activeElement = first;
    dialog.props.onKeyDown({ key: "Tab", shiftKey: true, preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(fakeDocument.activeElement, last);

    dialog.props.onKeyDown({ key: "Escape", shiftKey: false, preventDefault: () => undefined });
    assert.equal(closed, 1);

    await act(async () => renderer.root.findByProps({ children: "Cancel" }).props.onClick());
    assert.equal(closed, 2);

    await act(async () => renderer.unmount());
    assert.equal(fakeDocument.activeElement, previous);
  } finally {
    globalThis.document = originals.document;
    globalThis.HTMLElement = originals.HTMLElement;
    globalThis.requestAnimationFrame = originals.requestAnimationFrame;
    globalThis.cancelAnimationFrame = originals.cancelAnimationFrame;
  }
});

test("the packaged form delegates upload, paste, drop, thumbnail, policy, automation, and unchecked consent", async () => {
  const requests = [];
  const fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    if (init.method === "GET") return jsonResponse(reporterPolicy);
    if (String(url).includes("/subscription")) {
      return jsonResponse({
        notification_subscription: {
          active: true,
          created: true,
          recipient_hint: "j***@example.com",
          subscribed_at: "2026-08-26T14:00:00.000Z",
        },
      }, 201);
    }
    return jsonResponse({ bug_id: "bug-ui-1" }, 201);
  };
  let renderer;
  await act(async () => {
    renderer = create(createElement(
      HandrailBugReporterProvider,
      { config: config(fetch) },
      createElement(HandrailBugReporterDialog, { open: true, onClose: () => undefined }),
    ));
  });

  const notification = renderer.root.findByProps({ "aria-label": "Email me when this bug is fixed" });
  assert.equal(notification.props.checked, false);
  assert.match(JSON.stringify(renderer.toJSON()), /j\*\*\*@example\.com/);

  const inputs = renderer.root.findAll((node) => node.type === "input");
  const title = inputs.find((node) => node.props.placeholder === "What is broken?");
  const details = renderer.root.findByProps({ placeholder: "Describe what you expected and what happened instead. You can paste a screenshot here." });
  const reproducer = renderer.root.findByProps({ placeholder: "1. Open…  2. Click…  3. See…" });
  await act(async () => {
    title.props.onChange({ target: { value: "Checkout is blocked" } });
    details.props.onChange({ target: { value: "Continue does not respond." } });
    reproducer.props.onChange({ target: { value: "1. Open checkout. 2. Click Continue." } });
  });

  const invalidFileInput = renderer.root.findByProps({ "aria-label": "Attach screenshot" });
  assert.equal(invalidFileInput.props.hidden, true);
  assert.equal(renderer.root.findAllByProps({ "aria-label": "Add or paste a screenshot" }).length, 1);
  await act(async () => invalidFileInput.props.onChange({
    target: { files: [{ type: "image/gif", name: "bad.gif" }], value: "bad.gif" },
  }));
  assert.match(renderer.root.findByProps({ role: "alert" }).children.join(""), /PNG or JPEG/);

  const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: "image/png" });
  Object.defineProperty(png, "name", { value: "checkout.png" });
  await act(async () => invalidFileInput.props.onChange({ target: { files: [png], value: "checkout.png" } }));
  assert.equal(renderer.root.findAllByProps({ children: "checkout.png" }).length, 1);
  assert.equal(renderer.root.findAllByProps({ alt: "Bug report screenshot preview" }).length, 1);
  assert.equal(renderer.root.findAllByProps({ children: "Replace" }).length, 1);
  assert.equal(renderer.root.findAllByProps({ children: "Remove" }).length, 1);

  const pastedPng = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: "image/png" });
  Object.defineProperty(pastedPng, "name", { value: "clipboard.png" });
  const pasteTargets = renderer.root.findAll((node) => (
    typeof node.type === "string" && typeof node.props.onPaste === "function"
  ));
  assert.equal(pasteTargets.length, 1, "paste should be handled at one form boundary");
  let prevented = 0;
  await act(async () => pasteTargets[0].props.onPaste({
    clipboardData: {
      items: [{ kind: "file", type: "image/png", getAsFile: () => pastedPng }],
    },
    preventDefault: () => { prevented += 1; },
  }));
  assert.equal(prevented, 1);
  assert.equal(renderer.root.findAllByProps({ children: "clipboard.png" }).length, 1);
  assert.equal(renderer.root.findAllByProps({ children: "checkout.png" }).length, 0);

  const droppedPng = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: "image/png" });
  Object.defineProperty(droppedPng, "name", { value: "dropped.png" });
  const dropzone = renderer.root.findByProps({ "data-handrail-bug-screenshot-dropzone": "true" });
  let dragPrevented = 0;
  const dragData = { types: ["Files"], files: [droppedPng], dropEffect: "none" };
  await act(async () => dropzone.props.onDragOver({
    dataTransfer: dragData,
    preventDefault: () => { dragPrevented += 1; },
  }));
  await act(async () => dropzone.props.onDrop({
    dataTransfer: dragData,
    preventDefault: () => { dragPrevented += 1; },
  }));
  assert.equal(dragPrevented, 2);
  assert.equal(dragData.dropEffect, "copy");
  assert.equal(renderer.root.findAllByProps({ children: "dropped.png" }).length, 1);
  assert.equal(renderer.root.findAllByProps({ children: "clipboard.png" }).length, 0);

  const checkboxes = renderer.root.findAll((node) => node.type === "input" && node.props.type === "checkbox");
  const automation = checkboxes.find((node) => node.props["aria-label"] === undefined);
  await act(async () => automation.props.onChange({ target: { checked: true } }));
  await act(async () => renderer.root.findByProps({ "aria-label": "Email me when this bug is fixed" }).props.onChange({ target: { checked: true } }));
  assert.equal(renderer.root.findByProps({ "aria-label": "Email me when this bug is fixed" }).props.checked, true);

  const reportForm = renderer.root.findAll((node) => node.type === "form")[0];
  await act(async () => reportForm.props.onSubmit({ preventDefault: () => undefined }));

  const submitRequest = requests.find((request) => request.init.method === "POST" && !request.url.includes("/subscription"));
  const submitted = JSON.parse(submitRequest.init.body);
  assert.equal(submitted.title, "Checkout is blocked");
  assert.equal(submitted.description, "Continue does not respond.");
  assert.equal(submitted.reproducer, "1. Open checkout. 2. Click Continue.");
  assert.equal(submitted.screenshot_mime_type, "image/png");
  assert.deepEqual(submitted.automation_requests, { fix: true });
  const subscription = requests.find((request) => request.url.includes("/subscription"));
  assert.ok(subscription);
  assert.deepEqual(JSON.parse(subscription.init.body), {
    reporter_notification: {
      notify_on_resolution: true,
      consent_version: "v1",
    },
  });
  const success = renderer.root.findByProps({ "data-handrail-bug-submission-success": "true" });
  assert.ok(success);
  assert.equal(renderer.root.findAllByProps({ children: "Thanks for submitting this bug" }).length, 1);
  assert.equal(renderer.root.findAll((node) => (
    node.children.join("") === "Email updates are enabled for j***@example.com."
  )).length, 1);
  assert.equal(renderer.root.findAllByProps({ placeholder: "What is broken?" }).length, 0);
  assert.equal(renderer.root.findAll((node) => node.type === "textarea").length, 0);

  await act(async () => renderer.root.findByProps({ children: "Report another bug" }).props.onClick());
  assert.equal(renderer.root.findByProps({ placeholder: "What is broken?" }).props.value, "");
  assert.equal(renderer.root.findAllByProps({ "data-handrail-bug-submission-success": "true" }).length, 0);
  await act(async () => renderer.unmount());
});

test("a notification failure still shows a thank-you screen and clearly confirms the bug was saved", async () => {
  const fetch = async (url, init) => {
    if (init.method === "GET") return jsonResponse(reporterPolicy);
    if (String(url).includes("/subscription")) {
      return jsonResponse({
        error: "The feedback report was not found.",
        code: "feedback_notification_report_not_found",
      }, 404);
    }
    return jsonResponse({ bug_id: "bug-ui-warning" }, 201);
  };
  let renderer;
  await act(async () => {
    renderer = create(createElement(
      HandrailBugReporterProvider,
      { config: config(fetch) },
      createElement(HandrailBugReporterDialog, { open: true, onClose: () => undefined }),
    ));
  });

  await act(async () => {
    renderer.root.findByProps({ placeholder: "What is broken?" }).props.onChange({
      target: { value: "Saved but notification failed" },
    });
    renderer.root.findByProps({ placeholder: "Describe what you expected and what happened instead. You can paste a screenshot here." }).props.onChange({
      target: { value: "The report must remain successful." },
    });
    renderer.root.findByProps({ "aria-label": "Email me when this bug is fixed" }).props.onChange({
      target: { checked: true },
    });
  });
  await act(async () => renderer.root.find((node) => node.type === "form").props.onSubmit({
    preventDefault: () => undefined,
  }));

  assert.equal(renderer.root.findAllByProps({ "data-handrail-bug-submission-success": "true" }).length, 1);
  assert.match(renderer.root.findByProps({ role: "alert" }).children.join(""), /bug is saved/i);
  assert.equal(renderer.root.findAllByProps({ placeholder: "What is broken?" }).length, 0);
  await act(async () => renderer.unmount());
});

test("the packaged form hides notification consent without a Known User email", async () => {
  const unavailablePolicy = {
    ...reporterPolicy,
    reporter_notifications: {
      available: false,
      recipient_hint: null,
      lifecycles: ["fixed"],
    },
  };
  let renderer;
  await act(async () => {
    renderer = create(createElement(
      HandrailBugReporterProvider,
      { config: config(async () => jsonResponse(unavailablePolicy)) },
      createElement(HandrailBugReporterDialog, { open: true, onClose: () => undefined }),
    ));
  });

  assert.equal(renderer.root.findAllByProps({ "aria-label": "Email me when this bug is fixed" }).length, 0);
  assert.equal(renderer.root.findAllByProps({ type: "email" }).length, 0);
  await act(async () => renderer.unmount());
});

test("My bugs uses the provider history, filter, archive, restore, and clear-closed actions", async () => {
  const requests = [];
  let archived = false;
  const fetch = async (url, init) => {
    const request = { url: String(url), method: init.method };
    requests.push(request);
    if (init.method === "PUT") {
      archived = true;
      return jsonResponse({ contract_version: "v1", bug_id: "bug-1", archived: true, archived_at: "2026-08-26T14:00:00.000Z" });
    }
    if (init.method === "DELETE") {
      archived = false;
      return jsonResponse({ contract_version: "v1", bug_id: "bug-1", archived: false, archived_at: null });
    }
    if (init.method === "POST") return jsonResponse({ contract_version: "v1", archived_count: 1 });
    const closedBug = trackedBug("bug-closed");
    return jsonResponse({
      contract_version: "v1",
      bugs: [
        trackedBug("bug-1", archived),
        {
          ...closedBug,
          status: "fixed",
          status_group: "closed",
          status_rollup: {
            ...closedBug.status_rollup,
            stage: "fixed",
            label: "Fixed",
            terminal: true,
            raw_status: "fixed",
            workflow_state: "fixed",
          },
        },
      ],
      summary: { total: 2, needs_attention: 0, in_progress: 1, closed: 1, not_reproduced: 0 },
      query: { search: null, status_group: null, sort: "newest", visibility: "active" },
      pagination: { limit: 20, filtered_count: 2, has_more: false, next_cursor: null },
    });
  };
  let renderer;
  await act(async () => {
    renderer = create(createElement(
      HandrailBugReporterProvider,
      { config: config(fetch), loadPolicyOnMount: false },
      createElement(HandrailBugReporterDialog, { open: true, onClose: () => undefined }),
    ));
  });

  const myBugsTab = renderer.root.findAllByProps({ role: "tab" })[1];
  await act(async () => {
    myBugsTab.props.onClick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.equal(renderer.root.findAllByType("article").length, 2);
  assert.equal(renderer.root.findAllByProps({ "data-handrail-bug-history": "true" }).length, 1);
  assert.equal(renderer.root.findByProps({ "aria-label": "Filter bugs by status" }).props.role, "group");
  assert.equal(renderer.root.findByProps({ role: "dialog" }).props.style.height, "min(872px, calc(100dvh - 28px))");
  assert.deepEqual(renderer.root.findByProps({ "aria-label": "Bug history visibility" }).findAllByType("button").map((button) => button.children.join("")), ["Active", "Archived"]);

  await act(async () => renderer.root.findByProps({ "aria-label": "Dismiss Bug bug-1" }).props.onClick());
  assert.equal(archived, true);
  await act(async () => renderer.root.findByProps({ "aria-label": "Restore Bug bug-1" }).props.onClick());
  assert.equal(archived, false);

  const search = renderer.root.findByProps({ "aria-label": "Search my bugs" });
  await act(async () => search.props.onChange({ target: { value: "checkout" } }));
  await act(async () => new Promise((resolve) => setTimeout(resolve, 350)));
  assert.ok(requests.some((request) => request.url.includes("search=checkout")));

  await act(async () => renderer.root.findByProps({ children: "Clear closed (1)" }).props.onClick());
  assert.ok(requests.some((request) => request.method === "POST" && request.url.includes("archive-closed")));
  assert.ok(requests.some((request) => request.method === "PUT"));
  assert.ok(requests.some((request) => request.method === "DELETE"));
  await act(async () => renderer.unmount());
});
