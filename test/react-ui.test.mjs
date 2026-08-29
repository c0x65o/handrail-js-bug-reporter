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
  ask_options: [],
  automation_policy: {
    schema_version: 3,
    automatic_fix_max_risk: "high",
    production_max_risk_by_impact: {
      critical: "moderate",
      high: "low",
      moderate: "none",
      low: "none",
    },
  },
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
  assert.equal(launcher.props.style["--handrail-bug-accent"], "light-dark(#2563eb, #78a9ff)");
  assert.equal(launcher.props.style.background, "var(--handrail-bug-accent)");

  await act(async () => launcher.props.onClick());
  assert.equal(renderer.root.findAllByProps({ role: "dialog" }).length, 1);
  assert.equal(renderer.root.findByProps({ "aria-haspopup": "dialog" }).props["aria-expanded"], true);
  const overlay = renderer.root.findByProps({ "data-handrail-bug-reporter": "overlay" });
  assert.equal(overlay.props["data-theme"], "auto");
  assert.equal(overlay.props.style.colorScheme, "inherit");
  assert.equal(overlay.props.style["--handrail-bug-accent"], "light-dark(#2563eb, #78a9ff)");
  assert.equal(overlay.props.style["--handrail-bug-warning-text"], "light-dark(#b54708, #fbc46d)");
  assert.equal(overlay.props.style["--handrail-bug-info-text"], "light-dark(#175cd3, #a7c7ff)");
  assert.match(overlay.props.style["--handrail-bug-font-family"], /Segoe UI/u);
  const dialogCss = renderer.root.findByType("style").children.join("");
  assert.match(dialogCss, /button \{\s+appearance: none;/u);
  assert.match(dialogCss, /:focus-visible \{\s+outline: 2px solid var\(--handrail-bug-accent\) !important;/u);
  assert.match(dialogCss, /data-handrail-bug-report-form/u);
  const [reportTab, historyTab] = renderer.root.findAllByProps({ role: "tab" });
  assert.equal(reportTab.props.style.WebkitAppearance, "none");
  assert.equal(reportTab.props.style.color, "var(--handrail-bug-accent-text)");
  assert.equal(reportTab.props.style.background, "var(--handrail-bug-accent)");
  assert.equal(historyTab.props.style.color, "var(--handrail-bug-muted-text)");
  assert.equal(historyTab.props.style.background, "var(--handrail-bug-surface)");

  await act(async () => renderer.root.findByProps({ "aria-label": "Close bug reporter" }).props.onClick());
  assert.equal(renderer.root.findAllByProps({ role: "dialog" }).length, 0);
  await act(async () => renderer.unmount());
});

test("a controlled host theme can switch the packaged UI from light to dark", async () => {
  const dialog = (themeMode) => renderInsideProvider(
    createElement(HandrailBugReporterDialog, {
      open: true,
      onClose: () => undefined,
      appearance: { themeMode },
    }),
  );
  let renderer;
  await act(async () => { renderer = create(dialog("light")); });

  let overlay = renderer.root.findByProps({ "data-handrail-bug-reporter": "overlay" });
  assert.equal(overlay.props["data-theme"], "light");
  assert.equal(overlay.props.style.colorScheme, "light");
  assert.equal(overlay.props.style["--handrail-bug-accent"], "#2563eb");
  assert.equal(overlay.props.style["--handrail-bug-surface"], "#ffffff");

  await act(async () => { renderer.update(dialog("dark")); });
  overlay = renderer.root.findByProps({ "data-handrail-bug-reporter": "overlay" });
  assert.equal(overlay.props["data-theme"], "dark");
  assert.equal(overlay.props.style.colorScheme, "dark");
  assert.equal(overlay.props.style["--handrail-bug-accent"], "#78a9ff");
  assert.equal(overlay.props.style["--handrail-bug-surface"], "#151a23");

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
            style: { "--handrail-bug-accent": "#b93815" },
          },
        })),
        { createNodeMock: (element) => element.type === "section" ? dialogNode : new MockElement(String(element.type)) },
      );
    });

    const overlay = renderer.root.findByProps({ "data-handrail-bug-reporter": "overlay" });
    assert.equal(overlay.props["data-theme"], "dark");
    assert.equal(overlay.props.style["--handrail-bug-accent"], "#b93815");
    assert.equal(overlay.props.style["--handrail-bug-radius"], "4px");
    assert.equal(overlay.props.style.colorScheme, "dark");

    const dialog = renderer.root.findByProps({ role: "dialog" });
    assert.equal(dialog.props["aria-modal"], "true");
    assert.ok(dialog.props["aria-labelledby"]);
    assert.ok(dialog.props["aria-describedby"]);
    assert.equal(dialog.props.style.width, "min(1560px, calc(100vw - 24px))");
    assert.equal(dialog.props.style.height, "min(720px, calc(100dvh - 16px))");
    assert.equal(dialog.props.style.maxHeight, "calc(100vh - 16px)");
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
    return jsonResponse({
      bug_id: "bug-ui-1",
      notification_subscription: {
        active: true,
        created: true,
        recipient_hint: "j***@example.com",
        subscribed_at: "2026-08-26T14:00:00.000Z",
      },
    }, 201);
  };
  let renderer;
  await act(async () => {
    renderer = create(createElement(
      HandrailBugReporterProvider,
      { config: config(fetch), initialForm: { route: "/checkout", appVersion: "1.2.3", buildNumber: "77" } },
      createElement(HandrailBugReporterDialog, { open: true, onClose: () => undefined }),
    ));
  });

  const notification = renderer.root.findByProps({ "aria-label": "Email me when this bug is fixed" });
  assert.equal(notification.props.checked, false);
  assert.match(JSON.stringify(renderer.toJSON()), /j\*\*\*@example\.com/);
  assert.equal(renderer.root.findAllByProps({ "data-handrail-bug-report-layout": "true" }).length, 1);
  assert.equal(renderer.root.findAllByProps({ "data-handrail-bug-context": "true" }).length, 1);
  assert.equal(renderer.root.findByProps({ "data-handrail-bug-report-panel": "true" }).props.style.display, "flex");
  assert.equal(renderer.root.findByProps({ "data-handrail-bug-report-form": "true" }).props.style.flex, "1 1 auto");
  assert.equal(renderer.root.findByProps({ "data-handrail-bug-report-layout": "true" }).props.style.flex, "1 1 auto");
  assert.match(renderer.root.findByProps({ "data-handrail-bug-report-details": "true" }).props.style.gridTemplateRows, /minmax\(126px, 1\.35fr\)/u);
  assert.match(JSON.stringify(renderer.toJSON()), /Attached context/);
  assert.match(JSON.stringify(renderer.toJSON()), /staging/);
  assert.match(JSON.stringify(renderer.toJSON()), /\/checkout/);
  assert.match(JSON.stringify(renderer.toJSON()), /1\.2\.3/);
  assert.equal(renderer.root.findAllByProps({ children: "Build" }).length, 0);

  const inputs = renderer.root.findAll((node) => node.type === "input");
  const title = inputs.find((node) => node.props.placeholder === "What is broken?");
  const details = renderer.root.findByProps({ placeholder: "Describe what you expected and what happened instead. You can paste a screenshot here." });
  const reproducer = renderer.root.findByProps({ placeholder: "1. Open…  2. Click…  3. See…" });
  assert.equal(details.props.style.height, "100%");
  assert.equal(reproducer.props.style.height, "100%");
  assert.equal(renderer.root.findByProps({ "aria-label": "Add or paste a screenshot" }).props.style.minHeight, 104);
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
  assert.equal(renderer.root.findByProps({ alt: "Bug report screenshot preview" }).props.style.width, 144);
  assert.equal(renderer.root.findByProps({ alt: "Bug report screenshot preview" }).props.style.height, 90);
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

  assert.equal(renderer.root.findAllByProps({ "data-handrail-bug-automation-policy": "true" }).length, 1);
  await act(async () => renderer.root.findByProps({ "aria-label": "Email me when this bug is fixed" }).props.onChange({ target: { checked: true } }));
  assert.equal(renderer.root.findByProps({ "aria-label": "Email me when this bug is fixed" }).props.checked, true);
  const severity = renderer.root.findByProps({ "aria-label": "Bug severity" });
  assert.equal(severity.props.value, "moderate");
  assert.deepEqual(
    severity.findAllByType("option").map((option) => [option.props.children, option.props.value]),
    [
      ["Critical", "critical"],
      ["High", "high"],
      ["Moderate", "moderate"],
      ["Low", "low"],
    ],
  );
  await act(async () => severity.props.onChange({ target: { value: "high" } }));

  const reportForm = renderer.root.findAll((node) => node.type === "form")[0];
  await act(async () => reportForm.props.onSubmit({ preventDefault: () => undefined }));

  const submitRequest = requests.find((request) => request.init.method === "POST" && !request.url.includes("/subscription"));
  const submitted = JSON.parse(submitRequest.init.body);
  assert.equal(submitted.title, "Checkout is blocked");
  assert.equal(submitted.description, "Continue does not respond.");
  assert.equal(submitted.reproducer, "1. Open checkout. 2. Click Continue.");
  assert.equal(submitted.screenshot_mime_type, "image/png");
  assert.equal(submitted.severity, "high");
  assert.equal(submitted.automation_requests, undefined);
  assert.deepEqual(submitted.reporter_notification, {
    notify_on_resolution: true,
    consent_version: "v1",
  });
  assert.equal(requests.some((request) => request.url.includes("/subscription")), false);
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
  const requests = [];
  const fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    if (init.method === "GET") return jsonResponse(reporterPolicy);
    return jsonResponse({
      bug_id: "bug-ui-warning",
      notification_subscription: null,
      intake_warnings: [{
        code: "feedback_notification_subscription_failed",
        message: "The report was accepted, but update notifications could not be enabled.",
      }],
    }, 201);
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
  assert.equal(requests.some((request) => request.url.includes("/subscription")), false);
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

test("My bugs uses the provider history, filters, and individual archive and restore actions", async () => {
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

  assert.equal(renderer.root.findByProps({ "aria-label": "2 total" }).children.join(""), "2");
  assert.equal(requests.filter((request) => request.method === "GET").length, 1);
  const myBugsTab = renderer.root.findAllByProps({ role: "tab" })[1];
  await act(async () => {
    myBugsTab.props.onClick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.equal(requests.filter((request) => request.method === "GET").length, 1);
  assert.equal(renderer.root.findAllByType("article").length, 2);
  assert.equal(renderer.root.findAllByProps({ "data-handrail-bug-history": "true" }).length, 1);
  assert.equal(renderer.root.findByProps({ "aria-label": "Filter bugs by status" }).props.role, "group");
  assert.equal(renderer.root.findByProps({ role: "dialog" }).props.style.height, "min(720px, calc(100dvh - 16px))");
  assert.equal(renderer.root.findByProps({ role: "table" }).props["aria-label"], "Reported bugs");
  const historyHeaders = renderer.root.findAllByProps({ role: "columnheader" }).map((node) => node.children.join(""));
  assert.ok(historyHeaders.includes("Submitted"));
  assert.ok(historyHeaders.includes("App version"));
  assert.equal(historyHeaders.includes("Date"), false);
  assert.equal(renderer.root.findAllByProps({ "data-handrail-bug-history-row": "true" }).length, 2);
  assert.ok(renderer.root.findAllByType("span").some((node) => (
    /^Updated .+ ago$/u.test(node.children.join(""))
  )));
  const [, selectedMyBugsTab] = renderer.root.findAllByProps({ role: "tab" });
  assert.equal(selectedMyBugsTab.props.style.color, "var(--handrail-bug-accent-text)");
  assert.equal(selectedMyBugsTab.props.style.background, "var(--handrail-bug-accent)");
  const visibilityButtons = renderer.root.findByProps({ "aria-label": "Bug history visibility" }).findAllByType("button");
  assert.equal(visibilityButtons[0].props.style.color, "var(--handrail-bug-accent)");
  assert.equal(visibilityButtons[1].props.style.color, "var(--handrail-bug-muted-text)");
  const filtersButton = renderer.root.findByProps({ children: "Filters" });
  assert.equal(filtersButton.props["aria-expanded"], true);
  assert.match(filtersButton.props.style.background, /var\(--handrail-bug-accent\) 8%/u);
  const viewButton = renderer.root.findByProps({ "aria-label": "View Bug bug-1" });
  const archiveButton = renderer.root.findByProps({ "aria-label": "Archive Bug bug-1" });
  assert.equal(viewButton.props.style.background, "transparent");
  assert.equal(archiveButton.props.style.background, "transparent");
  assert.equal(viewButton.props.style.border, 0);
  assert.equal(archiveButton.props.style.border, 0);
  assert.equal(renderer.root.findAllByProps({ children: "Clear closed (1)" }).length, 0);
  await act(async () => viewButton.props.onClick());
  assert.equal(renderer.root.findAllByProps({ "data-handrail-bug-history-detail": "true" }).length, 1);
  const detailLabels = renderer.root.findByProps({ "data-handrail-bug-history-detail": "true" })
    .findAllByType("strong").map((node) => node.children.join(""));
  assert.ok(detailLabels.includes("Bug ID"));
  assert.ok(detailLabels.includes("Submitted"));
  assert.ok(detailLabels.includes("App version"));
  assert.equal(detailLabels.includes("Environment"), false);
  assert.deepEqual(renderer.root.findByProps({ "aria-label": "Bug history visibility" }).findAllByType("button").map((button) => button.children.join("")), ["Active", "Archived"]);

  await act(async () => renderer.root.findByProps({ "aria-label": "Archive Bug bug-1" }).props.onClick());
  assert.equal(archived, true);
  await act(async () => renderer.root.findByProps({ "aria-label": "Restore Bug bug-1" }).props.onClick());
  assert.equal(archived, false);

  const search = renderer.root.findByProps({ "aria-label": "Search my bugs" });
  await act(async () => search.props.onChange({ target: { value: "checkout" } }));
  await act(async () => new Promise((resolve) => setTimeout(resolve, 350)));
  assert.ok(requests.some((request) => request.url.includes("search=checkout")));

  assert.equal(requests.some((request) => request.method === "POST" && request.url.includes("archive-closed")), false);
  assert.ok(requests.some((request) => request.method === "PUT"));
  assert.ok(requests.some((request) => request.method === "DELETE"));
  await act(async () => renderer.unmount());
});

test("a submitted bug marks loaded tracking stale and refreshes it when My bugs opens", async () => {
  const bugs = [trackedBug("bug-existing")];
  const requests = [];
  const fetch = async (url, init) => {
    requests.push({ url: String(url), method: init.method });
    if (init.method === "POST") {
      bugs.unshift(trackedBug("bug-new"));
      return jsonResponse({ bug_id: "bug-new" }, 201);
    }
    return jsonResponse({
      contract_version: "v1",
      bugs: [...bugs],
      summary: {
        total: bugs.length,
        needs_attention: 0,
        in_progress: bugs.length,
        closed: 0,
        not_reproduced: 0,
      },
      query: {
        search: null,
        status_group: null,
        sort: "newest",
        visibility: "active",
      },
      pagination: {
        limit: 20,
        filtered_count: bugs.length,
        has_more: false,
        next_cursor: null,
      },
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
  await act(async () => {
    renderer.root.findAllByProps({ role: "tab" })[1].props.onClick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.equal(renderer.root.findAllByProps({ "data-handrail-bug-history-row": "true" }).length, 1);

  await act(async () => renderer.root.findAllByProps({ role: "tab" })[0].props.onClick());
  await act(async () => {
    renderer.root.findByProps({ placeholder: "What is broken?" }).props.onChange({
      target: { value: "New bug" },
    });
    renderer.root.findByProps({
      placeholder: "Describe what you expected and what happened instead. You can paste a screenshot here.",
    }).props.onChange({ target: { value: "The new bug should appear in tracking." } });
  });
  await act(async () => renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  assert.equal(renderer.root.findAllByProps({ "data-handrail-bug-submission-success": "true" }).length, 1);

  await act(async () => {
    renderer.root.findAllByProps({ role: "tab" })[1].props.onClick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.equal(requests.filter((request) => request.method === "GET").length, 2);
  assert.equal(renderer.root.findAllByProps({ "data-handrail-bug-history-row": "true" }).length, 2);
  assert.equal(renderer.root.findAllByProps({ "aria-label": "View Bug bug-new" }).length, 1);
  await act(async () => renderer.unmount());
});
