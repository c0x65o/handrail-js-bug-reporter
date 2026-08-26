import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
} from "react";

import {
  useHandrailBugReporter,
  type BugReporterTrackingQueryOptions,
} from "./react";
import {
  MAX_SCREENSHOT_BYTES,
  type AutomationOptionKey,
  type BugTrackingStatusGroup,
  type BugTrackingVisibility,
  type ScreenshotAttachment,
  type TrackedBugRecord,
} from "./reporter";

export type HandrailBugReporterThemeMode = "auto" | "light" | "dark";

export interface HandrailBugReporterThemeTokens {
  readonly accent: string;
  readonly accentText: string;
  readonly surface: string;
  readonly surfaceMuted: string;
  readonly text: string;
  readonly mutedText: string;
  readonly border: string;
  readonly overlay: string;
  readonly dangerSurface: string;
  readonly dangerText: string;
  readonly successSurface: string;
  readonly successText: string;
  readonly radius: string;
  readonly fontFamily: string;
}

export interface HandrailBugReporterAppearance {
  /** Defaults to auto, inheriting the host color scheme and typography. */
  readonly themeMode?: HandrailBugReporterThemeMode;
  /** Overrides individual packaged-UI design tokens without changing behavior. */
  readonly tokens?: Partial<HandrailBugReporterThemeTokens>;
  readonly className?: string;
  readonly style?: CSSProperties;
}

export interface HandrailBugReporterDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly heading?: string;
  readonly appearance?: HandrailBugReporterAppearance;
  /** Set false to offer only submission. Defaults true. */
  readonly showHistory?: boolean;
}

export interface HandrailBugReporterButtonProps
  extends Omit<HandrailBugReporterDialogProps, "open" | "onClose"> {
  readonly label?: string;
  readonly className?: string;
  readonly style?: CSSProperties;
}

type UiVariables = CSSProperties & Record<`--handrail-bug-${string}`, string>;
type DialogTab = "report" | "history";

const LIGHT_TOKENS: HandrailBugReporterThemeTokens = Object.freeze({
  accent: "#175cd3",
  accentText: "#ffffff",
  surface: "#ffffff",
  surfaceMuted: "#f6f8fb",
  text: "#17202e",
  mutedText: "#596579",
  border: "#d5dbe5",
  overlay: "rgba(15, 23, 42, 0.55)",
  dangerSurface: "#fff0f0",
  dangerText: "#a51d1d",
  successSurface: "#eaf8f0",
  successText: "#17623b",
  radius: "12px",
  fontFamily: "inherit",
});

const DARK_TOKENS: HandrailBugReporterThemeTokens = Object.freeze({
  accent: "#78a9ff",
  accentText: "#071426",
  surface: "#161b24",
  surfaceMuted: "#202733",
  text: "#f2f4f8",
  mutedText: "#b5bdca",
  border: "#3a4352",
  overlay: "rgba(0, 0, 0, 0.72)",
  dangerSurface: "#3a1d23",
  dangerText: "#ffb4b8",
  successSurface: "#173326",
  successText: "#95ddb7",
  radius: "12px",
  fontFamily: "inherit",
});

const AUTO_TOKENS: HandrailBugReporterThemeTokens = Object.freeze({
  accent: "LinkText",
  accentText: "Canvas",
  surface: "Canvas",
  surfaceMuted: "color-mix(in srgb, CanvasText 6%, Canvas)",
  text: "CanvasText",
  mutedText: "GrayText",
  border: "color-mix(in srgb, CanvasText 22%, Canvas)",
  overlay: "rgba(0, 0, 0, 0.55)",
  dangerSurface: "color-mix(in srgb, #d92d20 14%, Canvas)",
  dangerText: "#d92d20",
  successSurface: "color-mix(in srgb, #168a50 14%, Canvas)",
  successText: "#168a50",
  radius: "12px",
  fontFamily: "inherit",
});

const focusableSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function appearanceVariables(
  appearance: HandrailBugReporterAppearance | undefined,
): UiVariables {
  const mode = appearance?.themeMode || "auto";
  const base = mode === "dark"
    ? DARK_TOKENS
    : mode === "light"
      ? LIGHT_TOKENS
      : AUTO_TOKENS;
  const tokens = { ...base, ...appearance?.tokens };
  return {
    "--handrail-bug-accent": tokens.accent,
    "--handrail-bug-accent-text": tokens.accentText,
    "--handrail-bug-surface": tokens.surface,
    "--handrail-bug-surface-muted": tokens.surfaceMuted,
    "--handrail-bug-text": tokens.text,
    "--handrail-bug-muted-text": tokens.mutedText,
    "--handrail-bug-border": tokens.border,
    "--handrail-bug-overlay": tokens.overlay,
    "--handrail-bug-danger-surface": tokens.dangerSurface,
    "--handrail-bug-danger-text": tokens.dangerText,
    "--handrail-bug-success-surface": tokens.successSurface,
    "--handrail-bug-success-text": tokens.successText,
    "--handrail-bug-radius": tokens.radius,
    "--handrail-bug-font-family": tokens.fontFamily,
    colorScheme: mode === "auto" ? "inherit" : mode,
    ...appearance?.style,
  };
}

const styles: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 2147483000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    background: "var(--handrail-bug-overlay)",
  },
  dialog: {
    display: "flex",
    flexDirection: "column",
    width: "min(1120px, calc(100vw - 24px))",
    height: "min(900px, calc(100dvh - 24px))",
    maxHeight: "calc(100vh - 24px)",
    overflow: "hidden",
    border: "1px solid var(--handrail-bug-border)",
    borderRadius: "var(--handrail-bug-radius)",
    background: "var(--handrail-bug-surface)",
    color: "var(--handrail-bug-text)",
    boxShadow: "0 24px 70px rgba(0, 0, 0, 0.3)",
    fontFamily: "var(--handrail-bug-font-family)",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    padding: "18px 20px 14px",
    borderBottom: "1px solid var(--handrail-bug-border)",
  },
  content: { flex: 1, minHeight: 0, overflow: "auto", padding: 20 },
  tabs: {
    display: "flex",
    gap: 6,
    padding: 4,
    marginBottom: 18,
    borderRadius: 10,
    background: "var(--handrail-bug-surface-muted)",
  },
  tab: {
    flex: 1,
    border: "1px solid transparent",
    borderRadius: 8,
    padding: "8px 10px",
    cursor: "pointer",
    color: "inherit",
    background: "transparent",
    font: "inherit",
    fontWeight: 700,
  },
  activeTab: {
    borderColor: "var(--handrail-bug-border)",
    background: "var(--handrail-bug-surface)",
  },
  label: {
    display: "grid",
    gap: 7,
    marginBottom: 16,
    color: "inherit",
    fontSize: 13,
    fontWeight: 700,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid var(--handrail-bug-border)",
    borderRadius: 9,
    padding: "10px 12px",
    color: "inherit",
    background: "var(--handrail-bug-surface)",
    font: "inherit",
  },
  fieldset: {
    margin: "16px 0 0",
    padding: 14,
    border: "1px solid var(--handrail-bug-border)",
    borderRadius: 11,
  },
  screenshotDropzone: {
    display: "grid",
    placeItems: "center",
    minHeight: 84,
    padding: 16,
    border: "1px dashed var(--handrail-bug-border)",
    borderRadius: 10,
    background: "var(--handrail-bug-surface-muted)",
    textAlign: "center",
  },
  screenshotPreview: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    flexWrap: "wrap",
    padding: 10,
    border: "1px solid var(--handrail-bug-border)",
    borderRadius: 10,
    background: "var(--handrail-bug-surface)",
  },
  screenshotThumbnail: {
    width: 128,
    height: 84,
    flex: "0 0 128px",
    border: "1px solid var(--handrail-bug-border)",
    borderRadius: 8,
    objectFit: "cover",
    background: "var(--handrail-bug-surface-muted)",
  },
  formActions: {
    position: "sticky",
    bottom: -20,
    zIndex: 2,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    margin: "20px -20px -20px",
    padding: "14px 20px",
    borderTop: "1px solid var(--handrail-bug-border)",
    background: "var(--handrail-bug-surface)",
  },
  checkboxLabel: {
    display: "flex",
    gap: 9,
    alignItems: "flex-start",
    marginTop: 10,
    color: "inherit",
    fontSize: 13,
    cursor: "pointer",
  },
  button: {
    border: "1px solid transparent",
    borderRadius: 9,
    padding: "9px 14px",
    cursor: "pointer",
    font: "inherit",
    fontWeight: 700,
  },
  primaryButton: {
    background: "var(--handrail-bug-accent)",
    color: "var(--handrail-bug-accent-text)",
  },
  secondaryButton: {
    borderColor: "var(--handrail-bug-border)",
    background: "var(--handrail-bug-surface-muted)",
    color: "var(--handrail-bug-text)",
  },
  status: { marginBottom: 14, borderRadius: 9, padding: "10px 12px", fontSize: 13 },
  historyControls: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
    gap: 8,
    marginBottom: 14,
  },
  historyItem: {
    display: "grid",
    gap: 6,
    padding: "13px 0",
    borderBottom: "1px solid var(--handrail-bug-border)",
  },
};

function buttonStyle(kind: "primary" | "secondary"): CSSProperties {
  return {
    ...styles.button,
    ...(kind === "primary" ? styles.primaryButton : styles.secondaryButton),
  };
}

function submissionMessage(
  status: ReturnType<typeof useHandrailBugReporter>["submission"],
): { role: "alert" | "status"; text: string; style: CSSProperties } | null {
  if (status.status === "submitting") {
    return { role: "status", text: "Sending bug report…", style: {} };
  }
  if (status.status === "submitted") {
    const warning = status.result?.status === "submitted"
      ? status.result.notificationWarning
      : null;
    return {
      role: warning ? "alert" : "status",
      text: warning || "Bug report submitted successfully.",
      style: warning
        ? { background: "var(--handrail-bug-danger-surface)", color: "var(--handrail-bug-danger-text)" }
        : { background: "var(--handrail-bug-success-surface)", color: "var(--handrail-bug-success-text)" },
    };
  }
  if (status.status === "disabled") {
    return {
      role: "alert",
      text: "Bug reporting is disabled.",
      style: { background: "var(--handrail-bug-danger-surface)", color: "var(--handrail-bug-danger-text)" },
    };
  }
  if (status.status === "error") {
    return {
      role: "alert",
      text: status.error?.message || "The bug report could not be sent. Please try again.",
      style: { background: "var(--handrail-bug-danger-surface)", color: "var(--handrail-bug-danger-text)" },
    };
  }
  return null;
}

function screenshotPreviewUrl(
  screenshot: ScreenshotAttachment,
): { readonly url: string | null; readonly revoke: boolean } {
  if (typeof screenshot.data === "string") {
    if (/^data:image\/(?:png|jpeg);base64,/iu.test(screenshot.data)) {
      return { url: screenshot.data, revoke: false };
    }
    if (screenshot.mimeType && screenshot.data.trim()) {
      return {
        url: `data:${screenshot.mimeType};base64,${screenshot.data.replace(/\s+/gu, "")}`,
        revoke: false,
      };
    }
  }
  if (
    typeof Blob !== "undefined"
    && screenshot.data instanceof Blob
    && typeof URL !== "undefined"
    && typeof URL.createObjectURL === "function"
  ) {
    return { url: URL.createObjectURL(screenshot.data), revoke: true };
  }
  return { url: null, revoke: false };
}

function screenshotDetails(screenshot: ScreenshotAttachment): string {
  const type = screenshot.mimeType === "image/jpeg" ? "JPEG" : "PNG";
  const size = typeof Blob !== "undefined" && screenshot.data instanceof Blob
    ? screenshot.data.size
    : null;
  if (size === null) return `${type} · up to 20 MiB`;
  const formatted = size < 1024
    ? `${size} B`
    : size < 1024 * 1024
      ? `${(size / 1024).toFixed(1)} KiB`
      : `${(size / (1024 * 1024)).toFixed(1)} MiB`;
  return `${type} · ${formatted}`;
}

function bugDate(value: string | null): string {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Date unavailable"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function BugHistoryRow({
  bug,
  busy,
  onArchive,
  onRestore,
}: {
  readonly bug: TrackedBugRecord;
  readonly busy: boolean;
  readonly onArchive: (bugId: string) => Promise<void>;
  readonly onRestore: (bugId: string) => Promise<void>;
}): ReactElement {
  return <article style={styles.historyItem}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
      <strong>{bug.title}</strong>
      <span style={{ color: "var(--handrail-bug-muted-text)", fontSize: 12 }}>
        {bug.status_rollup.label}
      </span>
    </div>
    <div style={{ color: "var(--handrail-bug-muted-text)", fontSize: 12 }}>
      {bug.severity ? `${bug.severity.toUpperCase()} · ` : ""}
      Last reported {bugDate(bug.last_reported_at)} · {bug.reporter_occurrence_count} report{bug.reporter_occurrence_count === 1 ? "" : "s"}
    </div>
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void (bug.archived ? onRestore(bug.id) : onArchive(bug.id))}
        style={{ border: 0, padding: 0, color: "var(--handrail-bug-accent)", background: "transparent", cursor: busy ? "wait" : "pointer", font: "inherit", fontSize: 12, textDecoration: "underline" }}
      >
        {busy ? "Updating…" : bug.archived ? "Restore" : "Archive"}
      </button>
    </div>
  </article>;
}

function BugHistory(): ReactElement {
  const reporter = useHandrailBugReporter();
  const [search, setSearch] = useState("");
  const [statusGroup, setStatusGroup] = useState<BugTrackingStatusGroup | "">("");
  const [visibility, setVisibility] = useState<BugTrackingVisibility>("active");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [busyBugId, setBusyBugId] = useState<string | null>(null);
  const [historyActionError, setHistoryActionError] = useState<string | null>(null);

  const query = (): BugReporterTrackingQueryOptions => ({
    search: search.trim() || undefined,
    statusGroup: statusGroup || undefined,
    visibility,
    sort,
  });

  const refresh = async () => {
    setHistoryActionError(null);
    try {
      await reporter.refreshBugs(query());
    } catch (error) {
      setHistoryActionError(error instanceof Error ? error.message : "Bug history could not be loaded.");
    }
  };

  const changeArchive = async (bugId: string, archived: boolean) => {
    setBusyBugId(bugId);
    setHistoryActionError(null);
    try {
      if (archived) await reporter.archiveBug(bugId);
      else await reporter.restoreBug(bugId);
    } catch (error) {
      setHistoryActionError(error instanceof Error ? error.message : "Bug history could not be updated.");
    } finally {
      setBusyBugId(null);
    }
  };

  const clearClosed = async () => {
    setBusyBugId("__closed__");
    setHistoryActionError(null);
    try {
      await reporter.archiveClosedBugs();
    } catch (error) {
      setHistoryActionError(error instanceof Error ? error.message : "Closed bugs could not be archived.");
    } finally {
      setBusyBugId(null);
    }
  };

  const loadMore = async () => {
    setHistoryActionError(null);
    try {
      await reporter.loadMoreBugs();
    } catch (error) {
      setHistoryActionError(error instanceof Error ? error.message : "More bugs could not be loaded.");
    }
  };

  return <section aria-label="My bugs">
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void refresh();
      }}
    >
      <div style={styles.historyControls}>
        <input
          aria-label="Search my bugs"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search my bugs"
          style={styles.input}
        />
        <select
          aria-label="Bug status"
          value={statusGroup}
          onChange={(event) => setStatusGroup(event.target.value as BugTrackingStatusGroup | "")}
          style={styles.input}
        >
          <option value="">All statuses</option>
          <option value="needs_attention">Needs attention</option>
          <option value="in_progress">In progress</option>
          <option value="closed">Closed</option>
          <option value="not_reproduced">Not reproduced</option>
        </select>
        <select
          aria-label="Bug visibility"
          value={visibility}
          onChange={(event) => setVisibility(event.target.value as BugTrackingVisibility)}
          style={styles.input}
        >
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </select>
        <select
          aria-label="Bug sort order"
          value={sort}
          onChange={(event) => setSort(event.target.value as "newest" | "oldest")}
          style={styles.input}
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
        </select>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button type="submit" disabled={reporter.tracking.status === "loading"} style={buttonStyle("secondary")}>
          {reporter.tracking.status === "loading" ? "Loading…" : "Apply filters"}
        </button>
        <button type="button" disabled={busyBugId !== null} onClick={() => void clearClosed()} style={buttonStyle("secondary")}>
          {busyBugId === "__closed__" ? "Clearing…" : "Clear closed"}
        </button>
      </div>
      <div style={{ marginBottom: 12, color: "var(--handrail-bug-muted-text)", fontSize: 12 }}>
        Archive and Clear closed only hide bugs from your list; they do not change or delete the product team's bug record.
      </div>
    </form>

    {historyActionError && <div role="alert" style={{ ...styles.status, background: "var(--handrail-bug-danger-surface)", color: "var(--handrail-bug-danger-text)" }}>{historyActionError}</div>}
    {reporter.tracking.status === "loading" && reporter.tracking.bugs.length === 0 && <div role="status">Loading your bugs…</div>}
    {reporter.tracking.status === "error" && !historyActionError && <div role="alert" style={{ ...styles.status, background: "var(--handrail-bug-danger-surface)", color: "var(--handrail-bug-danger-text)" }}>{reporter.tracking.error?.message || "Bug history could not be loaded."}</div>}
    {reporter.tracking.status === "ready" && reporter.tracking.bugs.length === 0 && <div role="status" style={{ color: "var(--handrail-bug-muted-text)" }}>No bugs match these filters.</div>}
    {reporter.tracking.bugs.map((bug) => <BugHistoryRow
      key={bug.id}
      bug={bug}
      busy={busyBugId === bug.id}
      onArchive={(bugId) => changeArchive(bugId, true)}
      onRestore={(bugId) => changeArchive(bugId, false)}
    />)}
    {reporter.tracking.hasMore && <button type="button" disabled={reporter.tracking.status === "loading"} onClick={() => void loadMore()} style={{ ...buttonStyle("secondary"), marginTop: 14 }}>
      {reporter.tracking.status === "loading" ? "Loading…" : "Show more"}
    </button>}
    {reporter.tracking.summary && <div style={{ marginTop: 12, color: "var(--handrail-bug-muted-text)", fontSize: 12 }}>
      {reporter.tracking.summary.total} total bug{reporter.tracking.summary.total === 1 ? "" : "s"}
    </div>}
  </section>;
}

function BugReportForm({ onCancel }: { readonly onCancel: () => void }): ReactElement {
  const reporter = useHandrailBugReporter();
  const successHeadingId = useId();
  const [localError, setLocalError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const message = submissionMessage(reporter.submission);
  const notificationEligibility = reporter.policy?.reporterNotifications;
  const notificationsAvailable = notificationEligibility?.available === true;

  useEffect(() => {
    if (!notificationsAvailable && reporter.form.notifyOnResolution) {
      reporter.updateForm({ notifyOnResolution: false });
    }
  }, [notificationsAvailable, reporter.form.notifyOnResolution, reporter.updateForm]);

  useEffect(() => {
    const screenshot = reporter.form.screenshot;
    if (!screenshot) {
      setPreviewUrl(null);
      return undefined;
    }
    const preview = screenshotPreviewUrl(screenshot);
    setPreviewUrl(preview.url);
    return () => {
      if (
        preview.revoke
        && preview.url
        && typeof URL !== "undefined"
        && typeof URL.revokeObjectURL === "function"
      ) {
        URL.revokeObjectURL(preview.url);
      }
    };
  }, [reporter.form.screenshot]);

  const attachScreenshot = (file: File): boolean => {
    setLocalError(null);
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      setLocalError("Choose a PNG or JPEG screenshot.");
      return false;
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      setLocalError("Choose a PNG or JPEG screenshot no larger than 20 MiB.");
      return false;
    }
    reporter.replaceScreenshot({
      data: file,
      mimeType: file.type,
      filename: file.name || (file.type === "image/png"
        ? "clipboard-screenshot.png"
        : "clipboard-screenshot.jpg"),
    });
    return true;
  };

  const onScreenshot = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    attachScreenshot(file);
  };

  const onPaste = (event: ReactClipboardEvent<HTMLFormElement>) => {
    if (!reporter.canAttachScreenshot) return;
    const file = Array.from(event.clipboardData.items)
      .find((item) => item.kind === "file")
      ?.getAsFile();
    if (!file) return;
    event.preventDefault();
    attachScreenshot(file);
  };

  const onScreenshotDragOver = (event: ReactDragEvent<HTMLElement>) => {
    if (!reporter.canAttachScreenshot || !Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragActive(true);
  };

  const onScreenshotDrop = (event: ReactDragEvent<HTMLElement>) => {
    if (!reporter.canAttachScreenshot) return;
    const file = Array.from(event.dataTransfer.files)[0];
    if (!file) return;
    event.preventDefault();
    setDragActive(false);
    attachScreenshot(file);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);
    if (!reporter.form.title.trim() || !reporter.form.description.trim()) {
      setLocalError("Add a title and description before submitting.");
      return;
    }
    try {
      await reporter.submit();
    } catch {
      // The provider exposes a redacted, presentation-safe error state.
    }
  };

  const startAnotherReport = () => {
    reporter.resetSubmission();
    reporter.updateForm({
      title: "",
      description: "",
      severity: undefined,
      reproducer: undefined,
      screenshot: null,
      automationRequests: [],
      notifyOnResolution: false,
    });
  };

  if (reporter.submission.status === "submitted") {
    const result = reporter.submission.result?.status === "submitted"
      ? reporter.submission.result
      : null;
    const warning = result?.notificationWarning || null;
    const subscription = result?.notificationSubscription || null;
    return <section
      data-handrail-bug-submission-success="true"
      aria-labelledby={successHeadingId}
      style={{
        display: "grid",
        alignContent: "center",
        justifyItems: "center",
        minHeight: "min(520px, 60vh)",
        padding: "32px 18px",
        textAlign: "center",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          display: "grid",
          placeItems: "center",
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "var(--handrail-bug-success-surface)",
          color: "var(--handrail-bug-success-text)",
          fontSize: 30,
          fontWeight: 800,
        }}
      >✓</div>
      <h3 id={successHeadingId} style={{ margin: "18px 0 8px", fontSize: 24 }}>
        Thanks for submitting this bug
      </h3>
      <p role="status" aria-live="polite" style={{ maxWidth: 560, margin: 0, color: "var(--handrail-bug-muted-text)", lineHeight: 1.55 }}>
        Your report was sent to the product team. You can follow its progress from My bugs.
      </p>
      {subscription?.active === true && <div style={{ ...styles.status, maxWidth: 560, marginTop: 18, marginBottom: 0, background: "var(--handrail-bug-success-surface)", color: "var(--handrail-bug-success-text)" }}>
        Email updates are enabled{subscription.recipientHint ? ` for ${subscription.recipientHint}` : ""}.
      </div>}
      {warning && <div role="alert" style={{ ...styles.status, maxWidth: 560, marginTop: 18, marginBottom: 0, background: "var(--handrail-bug-danger-surface)", color: "var(--handrail-bug-danger-text)" }}>
        Your bug is saved, but email updates could not be enabled.
      </div>}
      <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap", marginTop: 24 }}>
        <button type="button" onClick={startAnotherReport} style={buttonStyle("secondary")}>Report another bug</button>
        <button type="button" onClick={onCancel} style={buttonStyle("primary")}>Done</button>
      </div>
    </section>;
  }

  return <form onSubmit={(event) => void onSubmit(event)} onPaste={onPaste}>
    {localError && <div role="alert" style={{ ...styles.status, background: "var(--handrail-bug-danger-surface)", color: "var(--handrail-bug-danger-text)" }}>{localError}</div>}
    {message && <div role={message.role} aria-live="polite" style={{ ...styles.status, ...message.style }}>{message.text}</div>}

    <label style={styles.label}>
      Short title
      <input
        required
        maxLength={500}
        value={reporter.form.title}
        onChange={(event) => reporter.updateForm({ title: event.target.value })}
        placeholder="What went wrong?"
        style={styles.input}
      />
    </label>
    <label style={styles.label}>
      Details
      <textarea
        required
        maxLength={20_000}
        value={reporter.form.description}
        onChange={(event) => reporter.updateForm({ description: event.target.value })}
        placeholder="What happened, and what did you expect? You can paste a screenshot here."
        style={{ ...styles.input, minHeight: 130, resize: "vertical" }}
      />
    </label>
    <label style={styles.label}>
      Severity
      <select
        value={reporter.form.severity || ""}
        onChange={(event) => reporter.updateForm({ severity: event.target.value || undefined })}
        style={styles.input}
      >
        <option value="">Not specified</option>
        <option value="sev1">Critical</option>
        <option value="sev2">High</option>
        <option value="sev3">Medium</option>
        <option value="sev4">Low</option>
      </select>
    </label>

    {reporter.canAttachScreenshot && <fieldset
      data-handrail-bug-screenshot-dropzone="true"
      style={styles.fieldset}
      onDragEnter={onScreenshotDragOver}
      onDragOver={onScreenshotDragOver}
      onDragLeave={() => setDragActive(false)}
      onDrop={onScreenshotDrop}
    >
      <legend style={{ padding: "0 5px", fontWeight: 700 }}>Screenshot</legend>
      <input
        ref={fileInputRef}
        aria-label="Attach screenshot"
        type="file"
        accept="image/png,image/jpeg"
        hidden
        tabIndex={-1}
        onChange={onScreenshot}
      />
      {reporter.form.screenshot ? <div style={styles.screenshotPreview}>
        {previewUrl
          ? <img src={previewUrl} alt="Bug report screenshot preview" style={styles.screenshotThumbnail} />
          : <div role="img" aria-label="Screenshot preview unavailable" style={{ ...styles.screenshotThumbnail, display: "grid", placeItems: "center", color: "var(--handrail-bug-muted-text)", fontSize: 12 }}>Preview unavailable</div>}
        <div style={{ flex: "1 1 180px", minWidth: 0 }}>
          <strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{reporter.form.screenshot.filename || "Attached screenshot"}</strong>
          <div style={{ marginTop: 4, color: "var(--handrail-bug-muted-text)", fontSize: 12 }}>{screenshotDetails(reporter.form.screenshot)}</div>
          <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
            <button type="button" onClick={() => fileInputRef.current?.click()} style={{ border: 0, padding: 0, color: "var(--handrail-bug-accent)", background: "transparent", cursor: "pointer", font: "inherit", fontWeight: 700 }}>Replace</button>
            <button type="button" onClick={reporter.removeScreenshot} style={{ border: 0, padding: 0, color: "var(--handrail-bug-danger-text)", background: "transparent", cursor: "pointer", font: "inherit", fontWeight: 700 }}>Remove</button>
          </div>
        </div>
      </div> : <div style={{
        ...styles.screenshotDropzone,
        ...(dragActive ? { borderColor: "var(--handrail-bug-accent)", color: "var(--handrail-bug-accent)" } : {}),
      }}>
        <button type="button" onClick={() => fileInputRef.current?.click()} style={{ ...buttonStyle("secondary"), background: "var(--handrail-bug-surface)" }}>Add screenshot</button>
        <div style={{ marginTop: 8, color: "var(--handrail-bug-muted-text)", fontSize: 12 }}>Choose, paste, or drop one PNG or JPEG, up to 20 MiB.</div>
      </div>}
    </fieldset>}

    {reporter.policyStatus === "loading" && <div role="status" style={{ marginTop: 14, color: "var(--handrail-bug-muted-text)", fontSize: 12 }}>Checking optional actions…</div>}
    {reporter.automationOptions.length > 0 && <fieldset style={styles.fieldset}>
      <legend style={{ padding: "0 5px", fontWeight: 700 }}>Optional actions</legend>
      {reporter.automationOptions.map((option) => <label key={option.key} style={styles.checkboxLabel}>
        <input
          type="checkbox"
          checked={reporter.form.automationRequests.includes(option.key)}
          onChange={(event) => reporter.setAutomationRequest(option.key as AutomationOptionKey, event.target.checked)}
        />
        <span><strong>{option.label}</strong></span>
      </label>)}
    </fieldset>}

    {notificationsAvailable && <fieldset style={styles.fieldset}>
      <legend style={{ padding: "0 5px", fontWeight: 700 }}>Updates</legend>
      <label style={{ ...styles.checkboxLabel, marginTop: 0 }}>
        <input
          aria-label="Email me when this bug is fixed"
          type="checkbox"
          checked={reporter.form.notifyOnResolution}
          onChange={(event) => reporter.updateForm({ notifyOnResolution: event.target.checked })}
        />
        <span>
          <strong>Email me when this bug is fixed</strong>
          <span style={{ display: "block", marginTop: 2, color: "var(--handrail-bug-muted-text)", fontSize: 12 }}>
            We’ll send one email after the fix is available in the environment you’re using{notificationEligibility?.recipientHint ? `, to ${notificationEligibility.recipientHint}` : ""}.
          </span>
        </span>
      </label>
    </fieldset>}

    <div style={styles.formActions}>
      <button type="button" onClick={onCancel} disabled={reporter.submission.status === "submitting"} style={buttonStyle("secondary")}>Cancel</button>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, flexWrap: "wrap" }}>
        <button type="submit" disabled={reporter.submission.status === "submitting"} style={{ ...buttonStyle("primary"), opacity: reporter.submission.status === "submitting" ? 0.65 : 1 }}>
          {reporter.submission.status === "submitting" ? "Submitting…" : "Submit bug"}
        </button>
      </div>
    </div>
  </form>;
}

export function HandrailBugReporterDialog({
  open,
  onClose,
  heading = "Report a bug",
  appearance,
  showHistory = true,
}: HandrailBugReporterDialogProps): ReactElement | null {
  const reporter = useHandrailBugReporter();
  const [tab, setTab] = useState<DialogTab>("report");
  const dialogRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const headingId = useId();
  const descriptionId = useId();
  const reportTabId = useId();
  const historyTabId = useId();
  const reportPanelId = useId();
  const historyPanelId = useId();

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const frame = typeof requestAnimationFrame === "function"
      ? requestAnimationFrame(() => {
          const first = dialogRef.current?.querySelector<HTMLElement>(focusableSelector);
          first?.focus();
        })
      : null;
    return () => {
      if (frame !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  const selectTab = (next: DialogTab) => {
    setTab(next);
    if (next === "history" && reporter.tracking.status === "idle") {
      void reporter.refreshBugs().catch(() => undefined);
    }
  };

  const closeDialog = () => {
    if (reporter.submission.status === "submitted") {
      reporter.resetSubmission();
      reporter.updateForm({
        title: "",
        description: "",
        severity: undefined,
        reproducer: undefined,
        screenshot: null,
        automationRequests: [],
        notifyOnResolution: false,
      });
    }
    onClose();
  };

  const onDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) || [],
    ).filter((element) => element.getAttribute("aria-hidden") !== "true");
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const variables = appearanceVariables(appearance);
  return <div
    data-handrail-bug-reporter="overlay"
    data-theme={appearance?.themeMode || "auto"}
    style={{ ...styles.overlay, ...variables }}
    onMouseDown={(event) => {
      if (event.target === event.currentTarget) closeDialog();
    }}
  >
    <section
      ref={dialogRef}
      className={appearance?.className}
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
      tabIndex={-1}
      style={styles.dialog}
      onKeyDown={onDialogKeyDown}
    >
      <header style={styles.header}>
        <div>
          <h2 id={headingId} style={{ margin: 0, fontSize: 20 }}>{heading}</h2>
          <div id={descriptionId} style={{ marginTop: 4, color: "var(--handrail-bug-muted-text)", fontSize: 12 }}>Send a bug report to your product team.</div>
        </div>
        <button type="button" aria-label="Close bug reporter" onClick={closeDialog} style={{ ...buttonStyle("secondary"), padding: "5px 10px", fontSize: 20 }}>×</button>
      </header>
      <div style={styles.content}>
        {showHistory && <div role="tablist" aria-label="Bug reporter views" style={styles.tabs}>
          <button id={reportTabId} type="button" role="tab" aria-controls={reportPanelId} aria-selected={tab === "report"} tabIndex={tab === "report" ? 0 : -1} onClick={() => selectTab("report")} style={{ ...styles.tab, ...(tab === "report" ? styles.activeTab : {}) }}>Report bug</button>
          <button id={historyTabId} type="button" role="tab" aria-controls={historyPanelId} aria-selected={tab === "history"} tabIndex={tab === "history" ? 0 : -1} onClick={() => selectTab("history")} style={{ ...styles.tab, ...(tab === "history" ? styles.activeTab : {}) }}>My bugs</button>
        </div>}
        {tab === "report"
          ? <div id={reportPanelId} role={showHistory ? "tabpanel" : undefined} aria-labelledby={showHistory ? reportTabId : undefined}><BugReportForm onCancel={closeDialog} /></div>
          : <div id={historyPanelId} role="tabpanel" aria-labelledby={historyTabId}><BugHistory /></div>}
      </div>
    </section>
  </div>;
}

export function HandrailBugReporterButton({
  label = "Report a bug",
  className,
  style,
  ...dialogProps
}: HandrailBugReporterButtonProps): ReactElement {
  const [open, setOpen] = useState(false);
  return <>
    <button
      type="button"
      className={className}
      style={style || buttonStyle("primary")}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => setOpen(true)}
    >
      {label}
    </button>
    <HandrailBugReporterDialog {...dialogProps} open={open} onClose={() => setOpen(false)} />
  </>;
}
