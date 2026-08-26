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
  /** Defaults to auto, following the host color scheme with polished SDK defaults. */
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
  accent: "#2563eb",
  accentText: "#ffffff",
  surface: "#ffffff",
  surfaceMuted: "#f7f9fc",
  text: "#172033",
  mutedText: "#667085",
  border: "#dbe2ec",
  overlay: "rgba(15, 23, 42, 0.62)",
  dangerSurface: "#fff1f0",
  dangerText: "#b42318",
  successSurface: "#ecfdf3",
  successText: "#027a48",
  radius: "16px",
  fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
});

const DARK_TOKENS: HandrailBugReporterThemeTokens = Object.freeze({
  accent: "#78a9ff",
  accentText: "#071426",
  surface: "#151a23",
  surfaceMuted: "#1e2633",
  text: "#f5f7fa",
  mutedText: "#aeb8c8",
  border: "#394455",
  overlay: "rgba(2, 6, 23, 0.76)",
  dangerSurface: "#3a1d23",
  dangerText: "#ffb4b8",
  successSurface: "#173326",
  successText: "#95ddb7",
  radius: "16px",
  fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
});

const AUTO_TOKENS: HandrailBugReporterThemeTokens = Object.freeze({
  accent: "light-dark(#2563eb, #78a9ff)",
  accentText: "light-dark(#ffffff, #071426)",
  surface: "light-dark(#ffffff, #151a23)",
  surfaceMuted: "light-dark(#f7f9fc, #1e2633)",
  text: "light-dark(#172033, #f5f7fa)",
  mutedText: "light-dark(#667085, #aeb8c8)",
  border: "light-dark(#dbe2ec, #394455)",
  overlay: "rgba(2, 6, 23, 0.66)",
  dangerSurface: "light-dark(#fff1f0, #3a1d23)",
  dangerText: "light-dark(#b42318, #ffb4b8)",
  successSurface: "light-dark(#ecfdf3, #173326)",
  successText: "light-dark(#027a48, #95ddb7)",
  radius: "16px",
  fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
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
    padding: 16,
    background: "var(--handrail-bug-overlay)",
    backdropFilter: "blur(3px)",
  },
  dialog: {
    display: "flex",
    flexDirection: "column",
    width: "min(1280px, calc(100vw - 32px))",
    height: "min(960px, calc(100dvh - 32px))",
    maxHeight: "calc(100vh - 32px)",
    overflow: "hidden",
    border: "1px solid var(--handrail-bug-border)",
    borderRadius: "var(--handrail-bug-radius)",
    background: "var(--handrail-bug-surface)",
    color: "var(--handrail-bug-text)",
    boxShadow: "0 30px 90px rgba(0, 0, 0, 0.34)",
    fontFamily: "var(--handrail-bug-font-family)",
    fontSize: 14,
    lineHeight: 1.45,
    isolation: "isolate",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    padding: "22px 28px 18px",
    borderBottom: "1px solid var(--handrail-bug-border)",
  },
  content: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    padding: "24px 28px",
    background: "var(--handrail-bug-surface)",
  },
  tabs: {
    display: "flex",
    gap: 8,
    padding: 5,
    marginBottom: 24,
    border: "1px solid var(--handrail-bug-border)",
    borderRadius: 14,
    background: "var(--handrail-bug-surface-muted)",
  },
  tab: {
    flex: 1,
    border: "1px solid transparent",
    borderRadius: 10,
    padding: "11px 16px",
    cursor: "pointer",
    color: "inherit",
    background: "transparent",
    font: "inherit",
    fontWeight: 700,
    minHeight: 46,
  },
  activeTab: {
    borderColor: "var(--handrail-bug-border)",
    background: "var(--handrail-bug-surface)",
    boxShadow: "0 3px 10px rgba(15, 23, 42, 0.08)",
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
    borderRadius: 11,
    padding: "11px 14px",
    color: "inherit",
    background: "var(--handrail-bug-surface)",
    font: "inherit",
    minHeight: 46,
    outlineOffset: 2,
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
    padding: "16px 28px",
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
    borderRadius: 10,
    padding: "10px 16px",
    cursor: "pointer",
    font: "inherit",
    fontWeight: 700,
    minHeight: 42,
    outlineOffset: 2,
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
  status: { marginBottom: 14, borderRadius: 11, padding: "11px 14px", fontSize: 13 },
  historyControls: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))",
    gap: 10,
    alignItems: "center",
    padding: 12,
    border: "1px solid var(--handrail-bug-border)",
    borderRadius: 14,
    background: "var(--handrail-bug-surface-muted)",
  },
  historyItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 18,
    flexWrap: "wrap",
    padding: "18px 20px",
    borderBottom: "1px solid var(--handrail-bug-border)",
    background: "var(--handrail-bug-surface)",
  },
  historyOverview: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 14,
  },
  historyList: {
    overflow: "hidden",
    border: "1px solid var(--handrail-bug-border)",
    borderRadius: 14,
    background: "var(--handrail-bug-surface-muted)",
  },
  historyListHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 20px",
    color: "var(--handrail-bug-muted-text)",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  historyPills: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    margin: "14px 0",
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

function bugRelativeAge(value: string | null): string {
  if (!value) return "Unknown age";
  const timestamp = new Date(value).valueOf();
  if (Number.isNaN(timestamp)) return "Unknown age";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"}`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"}`;
}

function bugSeverityLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "sev1") return "Critical";
  if (normalized === "sev2") return "High";
  if (normalized === "sev3") return "Medium";
  if (normalized === "sev4") return "Low";
  return value.toUpperCase();
}

function bugStatusGroup(bug: TrackedBugRecord): BugTrackingStatusGroup {
  if (bug.status_group) return bug.status_group;
  if (bug.status_rollup.stage === "not_reproduced") return "not_reproduced";
  if (bug.status_rollup.terminal) return "closed";
  return "in_progress";
}

function statusBadgeStyle(group: BugTrackingStatusGroup): CSSProperties {
  if (group === "closed") {
    return {
      color: "var(--handrail-bug-success-text)",
      borderColor: "color-mix(in srgb, var(--handrail-bug-success-text) 28%, transparent)",
      background: "var(--handrail-bug-success-surface)",
    };
  }
  if (group === "needs_attention") {
    return {
      color: "var(--handrail-bug-danger-text)",
      borderColor: "color-mix(in srgb, var(--handrail-bug-danger-text) 28%, transparent)",
      background: "var(--handrail-bug-danger-surface)",
    };
  }
  if (group === "in_progress") {
    return {
      color: "var(--handrail-bug-accent)",
      borderColor: "color-mix(in srgb, var(--handrail-bug-accent) 28%, transparent)",
      background: "color-mix(in srgb, var(--handrail-bug-accent) 10%, var(--handrail-bug-surface))",
    };
  }
  return {
    color: "var(--handrail-bug-muted-text)",
    borderColor: "var(--handrail-bug-border)",
    background: "var(--handrail-bug-surface-muted)",
  };
}

const HISTORY_FILTERS: readonly {
  readonly value: BugTrackingStatusGroup | "";
  readonly label: string;
}[] = Object.freeze([
  { value: "", label: "All" },
  { value: "needs_attention", label: "Needs attention" },
  { value: "in_progress", label: "In progress" },
  { value: "closed", label: "Closed" },
  { value: "not_reproduced", label: "Not reproduced" },
]);

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
  const group = bugStatusGroup(bug);
  const metadata = [
    bug.severity ? bugSeverityLabel(bug.severity) : null,
    bugDate(bug.last_reported_at),
    bug.reported_app_version ? `v${bug.reported_app_version.replace(/^v/iu, "")}` : null,
    bug.reported_app_flavor || bug.reported_route,
    bug.reporter_occurrence_count > 1 ? `${bug.reporter_occurrence_count} reports` : null,
  ].filter(Boolean);
  const statusTimestamp = bug.status_rollup.updated_at || bug.updated_at;
  return <article style={styles.historyItem}>
    <div style={{ flex: "1 1 360px", minWidth: 0 }}>
      <strong style={{ display: "block", marginBottom: 7, fontSize: 15, lineHeight: 1.35 }}>{bug.title}</strong>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center", color: "var(--handrail-bug-muted-text)", fontSize: 12 }}>
        {metadata.map((item, index) => <span key={`${String(item)}-${index}`} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          {index > 0 && <span aria-hidden="true" style={{ opacity: 0.45 }}>•</span>}{item}
        </span>)}
      </div>
    </div>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 18, flex: "0 1 auto", flexWrap: "wrap" }}>
      <div style={{ display: "grid", justifyItems: "end", gap: 4 }}>
        <span style={{ minWidth: 124, padding: "5px 11px", border: "1px solid", borderRadius: 999, textAlign: "center", fontSize: 12, fontWeight: 800, ...statusBadgeStyle(group) }}>
          {bug.status_rollup.label}
        </span>
        <span title={bugDate(statusTimestamp)} style={{ color: "var(--handrail-bug-muted-text)", fontSize: 11 }}>
          {bugRelativeAge(statusTimestamp)}
        </span>
      </div>
      <button
        type="button"
        disabled={busy}
        aria-label={`${bug.archived ? "Restore" : "Dismiss"} ${bug.title}`}
        onClick={() => void (bug.archived ? onRestore(bug.id) : onArchive(bug.id))}
        style={{ border: 0, padding: "7px 2px", color: "var(--handrail-bug-accent)", background: "transparent", cursor: busy ? "wait" : "pointer", font: "inherit", fontSize: 12, fontWeight: 800 }}
      >
        {busy ? "Updating…" : bug.archived ? "Restore" : "Dismiss"}
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
  const [filtersVisible, setFiltersVisible] = useState(true);
  const [busyBugId, setBusyBugId] = useState<string | null>(null);
  const [historyActionError, setHistoryActionError] = useState<string | null>(null);

  const query = (
    overrides: Partial<BugReporterTrackingQueryOptions> = {},
  ): BugReporterTrackingQueryOptions => ({
    search: search.trim() || undefined,
    statusGroup: statusGroup || undefined,
    visibility,
    sort,
    ...overrides,
  });

  const refresh = async (
    overrides: Partial<BugReporterTrackingQueryOptions> = {},
  ) => {
    setHistoryActionError(null);
    try {
      await reporter.refreshBugs(query(overrides));
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

  const summary = reporter.tracking.summary;
  const total = summary?.total ?? reporter.tracking.bugs.length;
  const showHistoryResults = reporter.tracking.status === "ready"
    || reporter.tracking.bugs.length > 0;
  const countFor = (value: BugTrackingStatusGroup | ""): number => {
    if (!value) return total;
    if (summary) return summary[value];
    return reporter.tracking.bugs.filter((bug) => bugStatusGroup(bug) === value).length;
  };

  const chooseVisibility = (next: BugTrackingVisibility) => {
    setVisibility(next);
    setStatusGroup("");
    void refresh({ visibility: next, statusGroup: undefined });
  };

  const chooseStatus = (next: BugTrackingStatusGroup | "") => {
    setStatusGroup(next);
    void refresh({ statusGroup: next || undefined });
  };

  return <section aria-label="My bugs" aria-busy={reporter.tracking.status === "loading"} data-handrail-bug-history="true" style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
    <div style={styles.historyOverview}>
      <div>
        <h3 style={{ margin: 0, fontSize: 18 }}>Your reported bugs</h3>
        <div style={{ marginTop: 5, color: "var(--handrail-bug-muted-text)", fontSize: 13 }}>
          {visibility === "archived"
            ? <><strong style={{ color: "var(--handrail-bug-text)" }}>{total}</strong> archived bug{total === 1 ? "" : "s"}</>
            : <><strong style={{ color: "var(--handrail-bug-text)" }}>{summary?.needs_attention ?? countFor("needs_attention")}</strong> need attention <span aria-hidden="true">·</span> <strong style={{ color: "var(--handrail-bug-text)" }}>{summary?.in_progress ?? countFor("in_progress")}</strong> in progress</>}
        </div>
      </div>
      <span style={{ color: "var(--handrail-bug-muted-text)", fontSize: 12 }}>
        {reporter.tracking.status === "loading" ? "Updating…" : reporter.tracking.status === "ready" ? "Updated just now" : ""}
      </span>
    </div>

    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
      <div role="group" aria-label="Bug history visibility" style={{ display: "flex", gap: 4, padding: 4, border: "1px solid var(--handrail-bug-border)", borderRadius: 12, background: "var(--handrail-bug-surface-muted)" }}>
        {(["active", "archived", "all"] as const).map((option) => <button
          key={option}
          type="button"
          aria-pressed={visibility === option}
          disabled={busyBugId !== null}
          onClick={() => chooseVisibility(option)}
          style={{
            ...styles.tab,
            flex: "0 0 auto",
            minHeight: 36,
            padding: "7px 13px",
            ...(visibility === option ? styles.activeTab : {}),
          }}
        >{option[0].toUpperCase() + option.slice(1)}</button>)}
      </div>
      {visibility !== "archived" && (summary?.closed ?? 0) > 0 && <button type="button" disabled={busyBugId !== null} onClick={() => void clearClosed()} style={{ border: 0, padding: "8px 2px", color: "var(--handrail-bug-accent)", background: "transparent", cursor: busyBugId ? "wait" : "pointer", font: "inherit", fontWeight: 800 }}>
        {busyBugId === "__closed__" ? "Clearing…" : `Clear closed (${summary?.closed ?? 0})`}
      </button>}
    </div>

    <form
      onSubmit={(event) => {
        event.preventDefault();
        void refresh();
      }}
    >
      <div style={styles.historyControls}>
        <input
          aria-label="Search my bugs"
          autoComplete="off"
          maxLength={200}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search title, page, or version…"
          style={{ ...styles.input, background: "var(--handrail-bug-surface)" }}
        />
        <button type="button" aria-expanded={filtersVisible} onClick={() => setFiltersVisible((current) => !current)} style={buttonStyle("secondary")}>Filters</button>
        <select
          aria-label="Bug sort order"
          value={sort}
          onChange={(event) => {
            const next = event.target.value as "newest" | "oldest";
            setSort(next);
            void refresh({ sort: next });
          }}
          style={{ ...styles.input, background: "var(--handrail-bug-surface)" }}
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
        </select>
        <button type="submit" disabled={reporter.tracking.status === "loading"} style={buttonStyle("primary")}>
          {reporter.tracking.status === "loading" ? "Searching…" : "Search"}
        </button>
      </div>
      {filtersVisible && <div role="group" aria-label="Filter bugs by status" style={styles.historyPills}>
        {HISTORY_FILTERS.map((filter) => <button
          key={filter.label}
          type="button"
          aria-pressed={statusGroup === filter.value}
          onClick={() => chooseStatus(filter.value)}
          style={{
            ...buttonStyle("secondary"),
            minHeight: 36,
            padding: "7px 13px",
            borderRadius: 999,
            ...(statusGroup === filter.value ? {
              borderColor: "var(--handrail-bug-accent)",
              color: "var(--handrail-bug-accent-text)",
              background: "var(--handrail-bug-accent)",
            } : {}),
          }}
        >{filter.label} <span style={{ opacity: 0.75 }}>{countFor(filter.value)}</span></button>)}
      </div>}
      <div style={{ margin: "0 0 14px", color: "var(--handrail-bug-muted-text)", fontSize: 12 }}>
        Dismiss and Clear closed only hide bugs from your list; they never change or delete the product team's record.
      </div>
    </form>

    {historyActionError && <div role="alert" style={{ ...styles.status, background: "var(--handrail-bug-danger-surface)", color: "var(--handrail-bug-danger-text)" }}>{historyActionError}</div>}
    {reporter.tracking.status === "loading" && reporter.tracking.bugs.length === 0 && <div role="status" style={{ ...styles.status, background: "var(--handrail-bug-surface-muted)", color: "var(--handrail-bug-muted-text)" }}>Loading your bugs…</div>}
    {reporter.tracking.status === "error" && !historyActionError && <div role="alert" style={{ ...styles.status, background: "var(--handrail-bug-danger-surface)", color: "var(--handrail-bug-danger-text)" }}>{reporter.tracking.error?.message || "Bug history could not be loaded."}</div>}
    {showHistoryResults && <div style={{ ...styles.historyList, flex: "1 1 auto", minHeight: 220, opacity: reporter.tracking.status === "loading" ? 0.68 : 1 }}>
      <div aria-hidden="true" style={styles.historyListHeader}>
        <span>Issue</span><span>Status &amp; action</span>
      </div>
      {reporter.tracking.bugs.length === 0
        ? <div role="status" style={{ display: "grid", placeItems: "center", minHeight: 180, padding: 24, color: "var(--handrail-bug-muted-text)", textAlign: "center" }}>
            {search || statusGroup ? "No bugs match your search and filters." : visibility === "archived" ? "You don’t have any archived bugs." : "You haven’t reported any bugs yet."}
          </div>
        : reporter.tracking.bugs.map((bug) => <BugHistoryRow
            key={bug.id}
            bug={bug}
            busy={busyBugId === bug.id}
            onArchive={(bugId) => changeArchive(bugId, true)}
            onRestore={(bugId) => changeArchive(bugId, false)}
          />)}
    </div>}
    {showHistoryResults && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 14, color: "var(--handrail-bug-muted-text)", fontSize: 12 }}>
      <span>Showing {reporter.tracking.bugs.length} of {total} bug{total === 1 ? "" : "s"}</span>
      {reporter.tracking.hasMore && <button type="button" disabled={reporter.tracking.status === "loading"} onClick={() => void loadMore()} style={buttonStyle("secondary")}>
        {reporter.tracking.status === "loading" ? "Loading…" : "Show more"}
      </button>}
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
  const historyCount = reporter.tracking.summary?.total
    ?? (reporter.tracking.status === "ready" ? reporter.tracking.bugs.length : null);
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
        <div style={{ minWidth: 0 }}>
          <h2 id={headingId} style={{ margin: 0, fontSize: 24, lineHeight: 1.2, letterSpacing: "-0.02em" }}>{heading}</h2>
          <div id={descriptionId} style={{ marginTop: 6, color: "var(--handrail-bug-muted-text)", fontSize: 13 }}>Send a bug report to your product team.</div>
        </div>
        <button type="button" aria-label="Close bug reporter" onClick={closeDialog} style={{ ...buttonStyle("secondary"), width: 44, minWidth: 44, height: 44, padding: 0, fontSize: 22, lineHeight: 1 }}>×</button>
      </header>
      <div style={styles.content}>
        {showHistory && <div role="tablist" aria-label="Bug reporter views" style={styles.tabs}>
          <button id={reportTabId} type="button" role="tab" aria-controls={reportPanelId} aria-selected={tab === "report"} tabIndex={tab === "report" ? 0 : -1} onClick={() => selectTab("report")} style={{ ...styles.tab, ...(tab === "report" ? styles.activeTab : {}) }}>Report bug</button>
          <button id={historyTabId} type="button" role="tab" aria-controls={historyPanelId} aria-selected={tab === "history"} tabIndex={tab === "history" ? 0 : -1} onClick={() => selectTab("history")} style={{ ...styles.tab, ...(tab === "history" ? styles.activeTab : {}) }}>
            <span>My bugs</span>
            {historyCount !== null && <span aria-label={`${historyCount} total`} style={{ display: "inline-grid", placeItems: "center", minWidth: 24, height: 24, marginLeft: 9, padding: "0 6px", borderRadius: 999, color: tab === "history" ? "var(--handrail-bug-accent)" : "var(--handrail-bug-muted-text)", background: tab === "history" ? "color-mix(in srgb, var(--handrail-bug-accent) 12%, var(--handrail-bug-surface))" : "var(--handrail-bug-surface)", fontSize: 12 }}>{historyCount}</span>}
          </button>
        </div>}
        {tab === "report"
          ? <div id={reportPanelId} role={showHistory ? "tabpanel" : undefined} aria-labelledby={showHistory ? reportTabId : undefined} style={{ flex: "1 0 auto" }}><BugReportForm onCancel={closeDialog} /></div>
          : <div id={historyPanelId} role="tabpanel" aria-labelledby={historyTabId} style={{ display: "flex", flex: "1 0 auto" }}><BugHistory /></div>}
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
