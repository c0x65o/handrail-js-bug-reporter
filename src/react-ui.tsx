import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
} from "react";

import {
  useHandrailBugReporter,
  type BugReporterTrackingQueryOptions,
} from "./react";
import type {
  AutomationOptionKey,
  BugTrackingStatusGroup,
  BugTrackingVisibility,
  TrackedBugRecord,
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
    colorScheme: mode === "auto" ? "normal" : mode,
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
    width: "min(700px, calc(100vw - 24px))",
    height: "min(720px, calc(100dvh - 24px))",
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
    gridTemplateColumns: "minmax(150px, 1fr) repeat(3, minmax(110px, auto))",
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

function BugReportForm({ onSubmitted }: { readonly onSubmitted: () => void }): ReactElement {
  const reporter = useHandrailBugReporter();
  const [localError, setLocalError] = useState<string | null>(null);
  const message = submissionMessage(reporter.submission);

  const onScreenshot = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setLocalError(null);
    if (!file) return;
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      reporter.removeScreenshot();
      setLocalError("Choose a PNG or JPEG screenshot.");
      event.target.value = "";
      return;
    }
    reporter.replaceScreenshot({
      data: file,
      mimeType: file.type,
      filename: file.name,
    });
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);
    if (!reporter.form.title.trim() || !reporter.form.description.trim()) {
      setLocalError("Add a title and description before submitting.");
      return;
    }
    try {
      const result = await reporter.submit();
      if (result.status === "submitted") onSubmitted();
    } catch {
      // The provider exposes a redacted, presentation-safe error state.
    }
  };

  return <form onSubmit={(event) => void onSubmit(event)}>
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
        placeholder="What happened, and what did you expect?"
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

    {reporter.canAttachScreenshot && <fieldset style={styles.fieldset}>
      <legend style={{ padding: "0 5px", fontWeight: 700 }}>Screenshot</legend>
      <input
        aria-label="Attach screenshot"
        type="file"
        accept="image/png,image/jpeg"
        onChange={onScreenshot}
      />
      <div style={{ marginTop: 7, color: "var(--handrail-bug-muted-text)", fontSize: 12 }}>
        PNG or JPEG, up to 20 MiB. The SDK validates file content before sending.
      </div>
      {reporter.form.screenshot && <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
        <span>{reporter.form.screenshot.filename || "Attached screenshot"}</span>
        <button type="button" onClick={reporter.removeScreenshot} style={{ border: 0, padding: 0, color: "var(--handrail-bug-accent)", background: "transparent", cursor: "pointer", font: "inherit", textDecoration: "underline" }}>Remove</button>
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
        <span><strong>{option.label}</strong>{option.description && <span style={{ display: "block", marginTop: 2, color: "var(--handrail-bug-muted-text)", fontSize: 12 }}>{option.description}</span>}</span>
      </label>)}
    </fieldset>}

    <fieldset style={styles.fieldset}>
      <legend style={{ padding: "0 5px", fontWeight: 700 }}>Updates</legend>
      <label style={{ ...styles.checkboxLabel, marginTop: 0 }}>
        <input
          aria-label="Email me when this bug is fixed or deployed"
          type="checkbox"
          checked={reporter.form.notifyOnResolution}
          onChange={(event) => reporter.updateForm({ notifyOnResolution: event.target.checked })}
        />
        <span>
          <strong>Email me when this bug is fixed or deployed</strong>
          <span style={{ display: "block", marginTop: 2, color: "var(--handrail-bug-muted-text)", fontSize: 12 }}>Only updates for this bug. Every email includes an unsubscribe link.</span>
        </span>
      </label>
      {reporter.form.notifyOnResolution && <label style={{ ...styles.label, margin: "12px 0 0" }}>
        Email address
        <input
          required
          type="email"
          autoComplete="email"
          maxLength={254}
          value={reporter.form.notificationEmail}
          onChange={(event) => reporter.updateForm({ notificationEmail: event.target.value })}
          style={styles.input}
        />
      </label>}
    </fieldset>

    <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 20 }}>
      {reporter.submission.status === "submitted" && <button type="button" onClick={() => { reporter.resetSubmission(); reporter.updateForm({ title: "", description: "", screenshot: null, automationRequests: [], notifyOnResolution: false }); }} style={buttonStyle("secondary")}>Report another</button>}
      <button type="submit" disabled={reporter.submission.status === "submitting"} style={{ ...buttonStyle("primary"), opacity: reporter.submission.status === "submitting" ? 0.65 : 1 }}>
        {reporter.submission.status === "submitting" ? "Submitting…" : "Submit bug"}
      </button>
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

  const onDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
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
    style={{ ...variables, ...styles.overlay }}
    onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
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
        <button type="button" aria-label="Close bug reporter" onClick={onClose} style={{ ...buttonStyle("secondary"), padding: "5px 10px", fontSize: 20 }}>×</button>
      </header>
      <div style={styles.content}>
        {showHistory && <div role="tablist" aria-label="Bug reporter views" style={styles.tabs}>
          <button type="button" role="tab" aria-selected={tab === "report"} onClick={() => selectTab("report")} style={{ ...styles.tab, ...(tab === "report" ? styles.activeTab : {}) }}>Report bug</button>
          <button type="button" role="tab" aria-selected={tab === "history"} onClick={() => selectTab("history")} style={{ ...styles.tab, ...(tab === "history" ? styles.activeTab : {}) }}>My bugs</button>
        </div>}
        {tab === "report"
          ? <BugReportForm onSubmitted={() => undefined} />
          : <BugHistory />}
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
