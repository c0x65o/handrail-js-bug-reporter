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
import {
  BUG_SEVERITY_OPTIONS,
  bugImpactLabel,
  type BugImpact,
} from "./severity";

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
  readonly warningSurface: string;
  readonly warningText: string;
  readonly infoSurface: string;
  readonly infoText: string;
  readonly radius: string;
  readonly fontFamily: string;
}

export type HandrailBugReporterCssVariable =
  | "--handrail-bug-accent"
  | "--handrail-bug-accent-text"
  | "--handrail-bug-surface"
  | "--handrail-bug-surface-muted"
  | "--handrail-bug-text"
  | "--handrail-bug-muted-text"
  | "--handrail-bug-border"
  | "--handrail-bug-overlay"
  | "--handrail-bug-danger-surface"
  | "--handrail-bug-danger-text"
  | "--handrail-bug-success-surface"
  | "--handrail-bug-success-text"
  | "--handrail-bug-warning-surface"
  | "--handrail-bug-warning-text"
  | "--handrail-bug-info-surface"
  | "--handrail-bug-info-text"
  | "--handrail-bug-radius"
  | "--handrail-bug-font-family";

export type HandrailBugReporterStyle = CSSProperties
  & Partial<Record<HandrailBugReporterCssVariable, string | number>>;

export interface HandrailBugReporterAppearance {
  /**
   * Defaults to auto, following the host CSS color scheme with polished SDK defaults.
   * Apps with their own saved theme should pass the current light/dark value and
   * re-render when it changes.
   */
  readonly themeMode?: HandrailBugReporterThemeMode;
  /** Overrides individual packaged-UI design tokens without changing behavior. */
  readonly tokens?: Partial<HandrailBugReporterThemeTokens>;
  readonly className?: string;
  /** Overlay styles may also override any scoped --handrail-bug-* variable. */
  readonly style?: HandrailBugReporterStyle;
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

type UiVariables = HandrailBugReporterStyle;
type DialogTab = "report" | "history";

const RESPONSIVE_DIALOG_CSS = `
[data-handrail-bug-reporter-dialog="true"] button {
  appearance: none;
  -webkit-appearance: none;
}
[data-handrail-bug-reporter-dialog="true"] :is(button, input, select, textarea):focus-visible {
  outline: 2px solid var(--handrail-bug-accent) !important;
  outline-offset: 2px;
}
@media (max-width: 860px) {
  [data-handrail-bug-report-layout="true"] {
    grid-template-columns: minmax(0, 1fr) !important;
  }
  [data-handrail-bug-context="true"] {
    order: -1;
  }
  [data-handrail-bug-history-header="true"] {
    display: none !important;
  }
  [data-handrail-bug-history-row="true"] {
    grid-template-columns: minmax(0, 1fr) auto !important;
    gap: 8px 14px !important;
    padding: 14px !important;
  }
  [data-handrail-bug-history-cell="secondary"] {
    display: none !important;
  }
  [data-handrail-bug-history-cell="status"] {
    grid-column: 1;
  }
  [data-handrail-bug-history-cell="action"] {
    grid-column: 2;
    grid-row: 1 / span 2;
  }
}
@media (max-width: 560px) {
  [data-handrail-bug-reporter="overlay"] {
    padding: 0 !important;
  }
  [data-handrail-bug-reporter-dialog="true"] {
    width: 100vw !important;
    height: 100dvh !important;
    max-height: none !important;
    border: 0 !important;
    border-radius: 0 !important;
  }
  [data-handrail-bug-reporter-header="true"] {
    padding: 16px 18px 14px !important;
  }
  [data-handrail-bug-reporter-content="report"] {
    padding: 12px 14px !important;
  }
  [data-handrail-bug-reporter-content="history"] {
    padding: 12px 14px 0 !important;
  }
  [data-handrail-bug-history-disclaimer="true"] {
    display: none !important;
  }
  [data-handrail-bug-history-list="true"] {
    min-height: 150px !important;
  }
  [data-handrail-bug-reporter-tabs="true"] {
    margin-bottom: 14px !important;
  }
}
`;

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
  warningSurface: "#fff8eb",
  warningText: "#b54708",
  infoSurface: "#eff6ff",
  infoText: "#175cd3",
  radius: "12px",
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
  warningSurface: "#3b2d16",
  warningText: "#fbc46d",
  infoSurface: "#172d4d",
  infoText: "#a7c7ff",
  radius: "12px",
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
  warningSurface: "light-dark(#fff8eb, #3b2d16)",
  warningText: "light-dark(#b54708, #fbc46d)",
  infoSurface: "light-dark(#eff6ff, #172d4d)",
  infoText: "light-dark(#175cd3, #a7c7ff)",
  radius: "12px",
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
  includeIntegrationStyle = true,
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
    "--handrail-bug-warning-surface": tokens.warningSurface,
    "--handrail-bug-warning-text": tokens.warningText,
    "--handrail-bug-info-surface": tokens.infoSurface,
    "--handrail-bug-info-text": tokens.infoText,
    "--handrail-bug-radius": tokens.radius,
    "--handrail-bug-font-family": tokens.fontFamily,
    colorScheme: mode === "auto" ? "inherit" : mode,
    ...(includeIntegrationStyle ? appearance?.style : undefined),
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
    padding: 8,
    background: "var(--handrail-bug-overlay)",
    backdropFilter: "blur(3px)",
  },
  dialog: {
    display: "flex",
    flexDirection: "column",
    width: "min(1560px, calc(100vw - 24px))",
    height: "min(720px, calc(100dvh - 16px))",
    maxHeight: "calc(100vh - 16px)",
    boxSizing: "border-box",
    overflow: "hidden",
    border: "1px solid var(--handrail-bug-border)",
    borderRadius: "var(--handrail-bug-radius)",
    background: "var(--handrail-bug-surface)",
    color: "var(--handrail-bug-text)",
    boxShadow: "0 30px 90px rgba(0, 0, 0, 0.34)",
    fontFamily: "var(--handrail-bug-font-family)",
    fontSize: 13,
    lineHeight: 1.4,
    isolation: "isolate",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    padding: "14px 24px 12px",
    borderBottom: "1px solid var(--handrail-bug-border)",
  },
  content: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    padding: "12px 20px",
    background: "var(--handrail-bug-surface)",
  },
  historyContent: {
    gap: 10,
    overflow: "hidden",
    padding: "10px 20px 0",
  },
  tabs: {
    display: "flex",
    gap: 8,
    padding: 0,
    marginBottom: 12,
    border: 0,
    borderRadius: 10,
    background: "transparent",
  },
  tab: {
    flex: 1,
    appearance: "none",
    WebkitAppearance: "none",
    border: "1px solid var(--handrail-bug-border)",
    borderRadius: 8,
    padding: "7px 12px",
    cursor: "pointer",
    color: "var(--handrail-bug-muted-text)",
    background: "var(--handrail-bug-surface)",
    font: "inherit",
    fontWeight: 700,
    minHeight: 36,
    outlineOffset: 2,
  },
  activeTab: {
    borderColor: "var(--handrail-bug-accent)",
    color: "var(--handrail-bug-accent-text)",
    background: "var(--handrail-bug-accent)",
    boxShadow: "0 1px 2px color-mix(in srgb, var(--handrail-bug-accent) 24%, transparent)",
  },
  selectedControl: {
    borderColor: "color-mix(in srgb, var(--handrail-bug-accent) 32%, var(--handrail-bug-border))",
    color: "var(--handrail-bug-accent)",
    background: "color-mix(in srgb, var(--handrail-bug-accent) 8%, var(--handrail-bug-surface))",
  },
  label: {
    display: "grid",
    gap: 5,
    marginBottom: 9,
    color: "inherit",
    fontSize: 13,
    fontWeight: 700,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid var(--handrail-bug-border)",
    borderRadius: 8,
    padding: "7px 10px",
    color: "inherit",
    background: "var(--handrail-bug-surface)",
    fontFamily: "inherit",
    fontSize: "inherit",
    fontWeight: 400,
    lineHeight: "inherit",
    minHeight: 36,
    outlineOffset: 2,
  },
  fieldset: {
    margin: "9px 0 0",
    padding: 10,
    border: "1px solid var(--handrail-bug-border)",
    borderRadius: 9,
  },
  screenshotDropzone: {
    display: "grid",
    placeItems: "center",
    minHeight: 58,
    padding: 10,
    border: "1px dashed var(--handrail-bug-border)",
    borderRadius: 10,
    background: "var(--handrail-bug-surface-muted)",
    textAlign: "center",
  },
  screenshotPreview: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    padding: 8,
    border: "1px solid var(--handrail-bug-border)",
    borderRadius: 10,
    background: "var(--handrail-bug-surface)",
  },
  screenshotThumbnail: {
    width: 108,
    height: 68,
    flex: "0 0 108px",
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
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    margin: "12px -20px -12px",
    padding: "9px 20px",
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
    appearance: "none",
    WebkitAppearance: "none",
    border: "1px solid transparent",
    borderRadius: 8,
    padding: "6px 12px",
    cursor: "pointer",
    font: "inherit",
    fontWeight: 700,
    minHeight: 34,
    outlineOffset: 2,
  },
  primaryButton: {
    background: "var(--handrail-bug-accent)",
    color: "var(--handrail-bug-accent-text)",
  },
  secondaryButton: {
    borderColor: "var(--handrail-bug-border)",
    background: "var(--handrail-bug-surface)",
    color: "var(--handrail-bug-text)",
  },
  historyActionButton: {
    appearance: "none",
    WebkitAppearance: "none",
    minHeight: 28,
    padding: "4px 3px",
    border: 0,
    borderRadius: 6,
    color: "var(--handrail-bug-accent)",
    background: "transparent",
    cursor: "pointer",
    font: "inherit",
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1.2,
    outlineOffset: 2,
  },
  status: { marginBottom: 10, borderRadius: 8, padding: "9px 12px", fontSize: 12 },
  historyControls: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
    marginBottom: 10,
  },
  historyItem: {
    display: "grid",
    gridTemplateColumns: "minmax(220px, 2.2fr) minmax(84px, .65fr) minmax(92px, .72fr) minmax(96px, .72fr) minmax(115px, 1fr) minmax(160px, 1.2fr) 136px",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderBottom: "1px solid var(--handrail-bug-border)",
    background: "var(--handrail-bug-surface)",
  },
  historyOverview: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 8,
  },
  historyList: {
    minHeight: 0,
    overflow: "hidden auto",
    border: "1px solid var(--handrail-bug-border)",
    borderRadius: 10,
    background: "var(--handrail-bug-surface-muted)",
  },
  historyListHeader: {
    display: "grid",
    gridTemplateColumns: "minmax(220px, 2.2fr) minmax(84px, .65fr) minmax(92px, .72fr) minmax(96px, .72fr) minmax(115px, 1fr) minmax(160px, 1.2fr) 136px",
    gap: 10,
    padding: "7px 12px",
    color: "var(--handrail-bug-muted-text)",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  historyPills: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    margin: "0 0 8px",
  },
  historyFooter: {
    display: "flex",
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    margin: "auto -20px 0",
    padding: "9px 20px",
    borderTop: "1px solid var(--handrail-bug-border)",
    background: "var(--handrail-bug-surface)",
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
  if (seconds < 60) return "Updated just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Updated ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `Updated ${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `Updated ${months} month${months === 1 ? "" : "s"} ago`;
}

function bugSeverityLabel(value: string): string {
  return bugImpactLabel(value) || value.toUpperCase();
}

function bugStatusGroup(bug: TrackedBugRecord): BugTrackingStatusGroup {
  if (bug.status_group) return bug.status_group;
  if (bug.status_rollup.stage === "not_reproduced") return "not_reproduced";
  if (bug.status_rollup.terminal) return "closed";
  return "in_progress";
}

function statusBadgeStyle(group: BugTrackingStatusGroup, label: string): CSSProperties {
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
    if (/fix|deploy|verif/iu.test(label)) {
      return {
        color: "var(--handrail-bug-warning-text)",
        borderColor: "color-mix(in srgb, var(--handrail-bug-warning-text) 28%, transparent)",
        background: "var(--handrail-bug-warning-surface)",
      };
    }
    return {
      color: "var(--handrail-bug-info-text)",
      borderColor: "color-mix(in srgb, var(--handrail-bug-info-text) 28%, transparent)",
      background: "var(--handrail-bug-info-surface)",
    };
  }
  return {
    color: "var(--handrail-bug-muted-text)",
    borderColor: "var(--handrail-bug-border)",
    background: "var(--handrail-bug-surface-muted)",
  };
}

function severityColor(severity: string): string {
  if (/critical|high|urgent/iu.test(severity)) return "var(--handrail-bug-danger-text)";
  if (/low|minor/iu.test(severity)) return "var(--handrail-bug-success-text)";
  return "var(--handrail-bug-warning-text)";
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
  expanded,
  onToggle,
  onArchive,
  onRestore,
}: {
  readonly bug: TrackedBugRecord;
  readonly busy: boolean;
  readonly expanded: boolean;
  readonly onToggle: (bugId: string) => void;
  readonly onArchive: (bugId: string) => Promise<void>;
  readonly onRestore: (bugId: string) => Promise<void>;
}): ReactElement {
  const group = bugStatusGroup(bug);
  const statusTimestamp = bug.status_rollup.updated_at || bug.updated_at;
  return <article role="row" data-handrail-bug-history-row="true" style={styles.historyItem}>
    <div role="cell" style={{ minWidth: 0 }}>
      <strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, lineHeight: 1.35 }}>{bug.title}</strong>
      {bug.reporter_occurrence_count > 1 && <span style={{ display: "block", marginTop: 3, color: "var(--handrail-bug-muted-text)", fontSize: 11 }}>{bug.reporter_occurrence_count} reports</span>}
    </div>
    <span role="cell" data-handrail-bug-history-cell="secondary" style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--handrail-bug-muted-text)", fontSize: 12 }}><span aria-hidden="true" style={{ width: 7, height: 7, flex: "0 0 7px", borderRadius: 999, background: severityColor(bug.severity) }} />{bugSeverityLabel(bug.severity)}</span>
    <span role="cell" data-handrail-bug-history-cell="secondary" style={{ color: "var(--handrail-bug-muted-text)", fontSize: 12 }}>{bugDate(bug.last_reported_at)}</span>
    <span role="cell" data-handrail-bug-history-cell="secondary" style={{ color: "var(--handrail-bug-muted-text)", fontSize: 12 }}>{bug.reported_app_version ? `v${bug.reported_app_version.replace(/^v/iu, "")}` : "—"}</span>
    <span role="cell" data-handrail-bug-history-cell="secondary" title={bug.reported_route || undefined} style={{ overflow: "hidden", color: "var(--handrail-bug-muted-text)", fontSize: 12, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bug.reported_app_flavor || bug.reported_route || "—"}</span>
    <div role="cell" data-handrail-bug-history-cell="status" style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
      <span style={{ overflow: "hidden", maxWidth: "100%", padding: "3px 8px", border: "1px solid", borderRadius: 999, textAlign: "center", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10, fontWeight: 800, ...statusBadgeStyle(group, bug.status_rollup.label) }}>{bug.status_rollup.label}</span>
      <span title={bugDate(statusTimestamp)} style={{ color: "var(--handrail-bug-muted-text)", fontSize: 10 }}>{bugRelativeAge(statusTimestamp)}</span>
    </div>
    <div role="cell" data-handrail-bug-history-cell="action" style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
      <button type="button" aria-expanded={expanded} aria-label={`View ${bug.title}`} onClick={() => onToggle(bug.id)} style={styles.historyActionButton}>View</button>
      <button
        type="button"
        disabled={busy}
        aria-label={`${bug.archived ? "Restore" : "Archive"} ${bug.title}`}
        onClick={() => void (bug.archived ? onRestore(bug.id) : onArchive(bug.id))}
        style={{
          ...styles.historyActionButton,
          color: "var(--handrail-bug-muted-text)",
          background: "transparent",
          cursor: busy ? "wait" : "pointer",
          opacity: busy ? 0.65 : 1,
        }}
      >
        {busy ? "Updating…" : bug.archived ? "Restore" : "Archive"}
      </button>
    </div>
    {expanded && <div role="cell" data-handrail-bug-history-detail="true" style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, padding: "10px 12px", border: "1px solid var(--handrail-bug-border)", borderRadius: 9, color: "var(--handrail-bug-muted-text)", background: "var(--handrail-bug-surface-muted)", fontSize: 11 }}>
      <span><strong style={{ display: "block", color: "var(--handrail-bug-text)" }}>Bug ID</strong>{bug.id}</span>
      <span><strong style={{ display: "block", color: "var(--handrail-bug-text)" }}>Environment</strong>{bug.environment}</span>
      <span><strong style={{ display: "block", color: "var(--handrail-bug-text)" }}>Reported page</strong>{bug.reported_route || "Not provided"}</span>
      <span><strong style={{ display: "block", color: "var(--handrail-bug-text)" }}>Occurrences</strong>{bug.occurrence_count}</span>
    </div>}
  </article>;
}

function BugHistory({ onClose }: { readonly onClose: () => void }): ReactElement {
  const reporter = useHandrailBugReporter();
  const [search, setSearch] = useState(() => reporter.tracking.query?.search || "");
  const [statusGroup, setStatusGroup] = useState<BugTrackingStatusGroup | "">(
    () => reporter.tracking.query?.statusGroup || "",
  );
  const [visibility, setVisibility] = useState<BugTrackingVisibility>(
    () => reporter.tracking.query?.visibility || "active",
  );
  const [sort, setSort] = useState<"newest" | "oldest">(
    () => reporter.tracking.query?.sort || "newest",
  );
  const [filtersVisible, setFiltersVisible] = useState(true);
  const [busyBugId, setBusyBugId] = useState<string | null>(null);
  const [expandedBugId, setExpandedBugId] = useState<string | null>(null);
  const [historyActionError, setHistoryActionError] = useState<string | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mobileQuery = window.matchMedia("(max-width: 520px)");
    const updateForViewport = () => setFiltersVisible(!mobileQuery.matches);
    updateForViewport();
    mobileQuery.addEventListener?.("change", updateForViewport);
    return () => mobileQuery.removeEventListener?.("change", updateForViewport);
  }, []);

  useEffect(() => () => {
    if (searchTimerRef.current !== null) clearTimeout(searchTimerRef.current);
  }, []);

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

  const searchBugs = (next: string) => {
    setSearch(next);
    if (searchTimerRef.current !== null) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      searchTimerRef.current = null;
      void refresh({ search: next.trim() || undefined });
    }, 300);
  };

  return <section aria-label="My bugs" aria-busy={reporter.tracking.status === "loading"} data-handrail-bug-history="true" style={{ display: "flex", width: "100%", minHeight: 0, flex: "1 1 auto", flexDirection: "column", boxSizing: "border-box" }}>
    <div style={styles.historyOverview}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, color: "var(--handrail-bug-muted-text)", fontSize: 12 }}>
        {visibility === "archived"
          ? <><strong style={{ color: "var(--handrail-bug-text)" }}>{total}</strong> archived bug{total === 1 ? "" : "s"}</>
          : <><span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 999, background: "var(--handrail-bug-danger-text)" }} /><strong style={{ color: "var(--handrail-bug-text)" }}>{summary?.needs_attention ?? countFor("needs_attention")}</strong> need attention <span aria-hidden="true" style={{ width: 1, height: 16, margin: "0 4px", background: "var(--handrail-bug-border)" }} /><span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 999, background: "var(--handrail-bug-info-text)" }} /><strong style={{ color: "var(--handrail-bug-text)" }}>{summary?.in_progress ?? countFor("in_progress")}</strong> in progress</>}
      </div>
      <span style={{ color: "var(--handrail-bug-muted-text)", fontSize: 12 }}>
        {reporter.tracking.status === "loading" ? "Updating…" : reporter.tracking.status === "ready" ? "Updated just now" : ""}
      </span>
    </div>

    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
      <div role="group" aria-label="Bug history visibility" style={{ display: "flex", gap: 2, padding: 2, border: "1px solid var(--handrail-bug-border)", borderRadius: 9, background: "var(--handrail-bug-surface-muted)" }}>
        {(["active", "archived"] as const).map((option) => <button
          key={option}
          type="button"
          aria-pressed={visibility === option}
          disabled={busyBugId !== null}
          onClick={() => chooseVisibility(option)}
          style={{
            ...styles.tab,
            flex: "0 0 auto",
            minHeight: 32,
            padding: "5px 12px",
            ...(visibility === option ? styles.selectedControl : {}),
          }}
        >{option[0].toUpperCase() + option.slice(1)}</button>)}
      </div>
    </div>

    <form
      style={{ width: "100%" }}
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
          onChange={(event) => searchBugs(event.target.value)}
          placeholder="Search title, page, or version…"
          style={{ ...styles.input, flex: "1 1 320px", minWidth: 0, background: "var(--handrail-bug-surface)" }}
        />
        <button type="button" aria-expanded={filtersVisible} onClick={() => setFiltersVisible((current) => !current)} style={{
          ...buttonStyle("secondary"),
          flex: "0 0 auto",
          ...(filtersVisible ? styles.selectedControl : {}),
        }}>Filters</button>
        <select
          aria-label="Bug sort order"
          value={sort}
          onChange={(event) => {
            const next = event.target.value as "newest" | "oldest";
            setSort(next);
            void refresh({ sort: next });
          }}
          style={{ ...styles.input, width: 140, flex: "0 1 140px", background: "var(--handrail-bug-surface)" }}
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
        </select>
      </div>
      {filtersVisible && <div role="group" aria-label="Filter bugs by status" style={styles.historyPills}>
        {HISTORY_FILTERS.map((filter) => <button
          key={filter.label}
          type="button"
          aria-pressed={statusGroup === filter.value}
          onClick={() => chooseStatus(filter.value)}
          style={{
            ...buttonStyle("secondary"),
            minHeight: 30,
            padding: "4px 11px",
            borderRadius: 999,
            ...(statusGroup === filter.value ? {
              borderColor: "var(--handrail-bug-accent)",
              color: "var(--handrail-bug-accent-text)",
              background: "var(--handrail-bug-accent)",
            } : {}),
          }}
        >{filter.label} <span style={{ opacity: 0.75 }}>{countFor(filter.value)}</span></button>)}
      </div>}
      <div data-handrail-bug-history-disclaimer="true" style={{ margin: "0 0 8px", color: "var(--handrail-bug-muted-text)", fontSize: 10 }}>
        Archive only hides a bug from your list; it never changes or deletes the product team's record.
      </div>
    </form>

    {historyActionError && <div role="alert" style={{ ...styles.status, background: "var(--handrail-bug-danger-surface)", color: "var(--handrail-bug-danger-text)" }}>{historyActionError}</div>}
    {reporter.tracking.status === "loading" && reporter.tracking.bugs.length === 0 && <div role="status" style={{ ...styles.status, background: "var(--handrail-bug-surface-muted)", color: "var(--handrail-bug-muted-text)" }}>Loading your bugs…</div>}
    {reporter.tracking.status === "error" && !historyActionError && <div role="alert" style={{ ...styles.status, background: "var(--handrail-bug-danger-surface)", color: "var(--handrail-bug-danger-text)" }}>{reporter.tracking.error?.message || "Bug history could not be loaded."}</div>}
    {showHistoryResults && <div role="table" aria-label="Reported bugs" data-handrail-bug-history-list="true" style={{ ...styles.historyList, flex: "1 1 auto", opacity: reporter.tracking.status === "loading" ? 0.68 : 1 }}>
      <div role="row" data-handrail-bug-history-header="true" style={styles.historyListHeader}>
        <span role="columnheader">Issue</span><span role="columnheader">Severity</span><span role="columnheader">Date</span><span role="columnheader">App version</span><span role="columnheader">Page / path</span><span role="columnheader">Status</span><span role="columnheader">Action</span>
      </div>
      {reporter.tracking.bugs.length === 0
        ? <div role="status" style={{ display: "grid", placeItems: "center", minHeight: 180, padding: 24, color: "var(--handrail-bug-muted-text)", textAlign: "center" }}>
            {search || statusGroup ? "No bugs match your search and filters." : visibility === "archived" ? "You don’t have any archived bugs." : "You haven’t reported any bugs yet."}
          </div>
        : reporter.tracking.bugs.map((bug) => <BugHistoryRow
            key={bug.id}
            bug={bug}
            busy={busyBugId === bug.id}
            expanded={expandedBugId === bug.id}
            onToggle={(bugId) => setExpandedBugId((current) => current === bugId ? null : bugId)}
            onArchive={(bugId) => changeArchive(bugId, true)}
            onRestore={(bugId) => changeArchive(bugId, false)}
          />)}
    </div>}
    {showHistoryResults && <div style={{ ...styles.historyFooter, color: "var(--handrail-bug-muted-text)", fontSize: 12 }}>
      <span>Showing {reporter.tracking.bugs.length} of {total} bug{total === 1 ? "" : "s"}</span>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, flexWrap: "wrap" }}>
        {reporter.tracking.hasMore && <button type="button" disabled={reporter.tracking.status === "loading"} onClick={() => void loadMore()} style={buttonStyle("secondary")}>
          {reporter.tracking.status === "loading" ? "Loading…" : "Show more"}
        </button>}
        <button type="button" onClick={onClose} style={buttonStyle("primary")}>Close</button>
      </div>
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
      impact: "moderate",
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

  return <form onSubmit={(event) => void onSubmit(event)} onPaste={onPaste} style={{ width: "100%" }}>
    {localError && <div role="alert" style={{ ...styles.status, background: "var(--handrail-bug-danger-surface)", color: "var(--handrail-bug-danger-text)" }}>{localError}</div>}
    {message && <div role={message.role} aria-live="polite" style={{ ...styles.status, ...message.style }}>{message.text}</div>}

    <div data-handrail-bug-report-layout="true" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.8fr) minmax(280px, .72fr)", gap: 16, alignItems: "start" }}>
      <section aria-label="Bug details">
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(150px, .3fr)", gap: 12 }}>
          <label style={styles.label}>
            Brief summary
            <input required maxLength={500} value={reporter.form.title} onChange={(event) => reporter.updateForm({ title: event.target.value })} placeholder="What is broken?" style={styles.input} />
          </label>
          <label style={styles.label}>
            Severity
            <select aria-label="Bug severity" value={reporter.form.impact} onChange={(event) => reporter.updateForm({ impact: event.target.value as BugImpact, severity: undefined })} style={styles.input}>
              {BUG_SEVERITY_OPTIONS.map((option) => <option key={option.impact} value={option.impact}>{option.label}</option>)}
            </select>
          </label>
        </div>
        <label style={styles.label}>
          What happened?
          <textarea required maxLength={20_000} value={reporter.form.description} onChange={(event) => reporter.updateForm({ description: event.target.value })} placeholder="Describe what you expected and what happened instead. You can paste a screenshot here." style={{ ...styles.input, minHeight: 96, resize: "vertical" }} />
        </label>
        <label style={styles.label}>
          <span>Steps to reproduce <span style={{ marginLeft: 6, color: "var(--handrail-bug-muted-text)", fontSize: 11, fontWeight: 500 }}>Optional</span></span>
          <textarea maxLength={20_000} value={reporter.form.reproducer || ""} onChange={(event) => reporter.updateForm({ reproducer: event.target.value || undefined })} placeholder="1. Open…  2. Click…  3. See…" style={{ ...styles.input, minHeight: 64, resize: "vertical" }} />
        </label>

        {reporter.canAttachScreenshot && <div
      data-handrail-bug-screenshot-dropzone="true"
      onDragEnter={onScreenshotDragOver}
      onDragOver={onScreenshotDragOver}
      onDragLeave={() => setDragActive(false)}
      onDrop={onScreenshotDrop}
    >
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
      </div> : <button type="button" aria-label="Add or paste a screenshot" onClick={() => fileInputRef.current?.click()} style={{
        ...styles.screenshotDropzone,
        width: "100%",
        color: dragActive ? "var(--handrail-bug-accent)" : "var(--handrail-bug-muted-text)",
        borderColor: dragActive ? "var(--handrail-bug-accent)" : "var(--handrail-bug-border)",
        cursor: "pointer",
        font: "inherit",
        fontWeight: 700,
      }}><span aria-hidden="true" style={{ marginRight: 8, fontSize: 20 }}>+</span>Add or paste a screenshot</button>}
        </div>}
      </section>

      <aside data-handrail-bug-context="true" aria-label="Attached context and options" style={{ display: "grid", gap: 10 }}>
        <section style={{ overflow: "hidden", border: "1px solid var(--handrail-bug-border)", borderRadius: 9, background: "var(--handrail-bug-surface)" }}>
          <h3 style={{ margin: 0, padding: "9px 12px", borderBottom: "1px solid var(--handrail-bug-border)", fontSize: 12 }}>Attached context</h3>
          {([
            ["Current page", reporter.form.route || "Not provided"],
            ["App version", reporter.form.appVersion || "Not provided"],
            ["Environment", reporter.reporter.configuration.environment || "Not provided"],
          ] as const).map(([label, value]) => <div key={label} style={{ display: "grid", gridTemplateColumns: "100px minmax(0, 1fr)", gap: 10, padding: "8px 12px", borderBottom: "1px solid var(--handrail-bug-border)", fontSize: 11 }}>
            <span style={{ color: "var(--handrail-bug-muted-text)" }}>{label}</span>
            <strong title={value} style={{ overflow: "hidden", textAlign: "right", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</strong>
          </div>)}
          <p style={{ margin: 0, padding: "8px 12px", color: "var(--handrail-bug-muted-text)", background: "var(--handrail-bug-surface-muted)", fontSize: 10 }}>This context is included with this report.</p>
        </section>

        {reporter.policyStatus === "loading" && <div role="status" style={{ color: "var(--handrail-bug-muted-text)", fontSize: 12 }}>Checking optional actions…</div>}
        {reporter.automationOptions.length > 0 && <fieldset style={{ ...styles.fieldset, margin: 0 }}>
          <legend style={{ padding: "0 5px", fontWeight: 700 }}>Optional actions</legend>
          {reporter.automationOptions.map((option) => <label key={option.key} style={styles.checkboxLabel}>
            <input type="checkbox" checked={reporter.form.automationRequests.includes(option.key)} onChange={(event) => reporter.setAutomationRequest(option.key as AutomationOptionKey, event.target.checked)} />
            <span><strong>{option.label}</strong></span>
          </label>)}
        </fieldset>}

        {notificationsAvailable && <fieldset style={{ ...styles.fieldset, margin: 0 }}>
          <legend style={{ padding: "0 5px", fontWeight: 700 }}>Updates</legend>
          <label style={{ ...styles.checkboxLabel, marginTop: 0 }}>
            <input aria-label="Email me when this bug is fixed" type="checkbox" checked={reporter.form.notifyOnResolution} onChange={(event) => reporter.updateForm({ notifyOnResolution: event.target.checked })} />
            <span><strong>Email me when this bug is fixed</strong><span style={{ display: "block", marginTop: 2, color: "var(--handrail-bug-muted-text)", fontSize: 11 }}>One email after the fix reaches this environment{notificationEligibility?.recipientHint ? `, to ${notificationEligibility.recipientHint}` : ""}.</span></span>
          </label>
        </fieldset>}
      </aside>
    </div>

    <div style={styles.formActions}>
      <button type="button" onClick={onCancel} disabled={reporter.submission.status === "submitting"} style={buttonStyle("secondary")}>Cancel</button>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, flexWrap: "wrap" }}>
        <button type="submit" disabled={reporter.submission.status === "submitting"} style={{ ...buttonStyle("primary"), opacity: reporter.submission.status === "submitting" ? 0.65 : 1 }}>
          {reporter.submission.status === "submitting" ? "Sending…" : "Send report"}
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
    if (
      next === "history"
      && (tab !== "history" || reporter.tracking.stale)
    ) {
      void reporter.refreshCurrentBugs().catch(() => undefined);
    }
  };

  const closeDialog = () => {
    if (reporter.submission.status === "submitting") return;
    if (reporter.submission.status === "submitted") {
      reporter.resetSubmission();
      reporter.updateForm({
        title: "",
        description: "",
        impact: "moderate",
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
    <style>{RESPONSIVE_DIALOG_CSS}</style>
    <section
      ref={dialogRef}
      className={appearance?.className}
      data-handrail-bug-reporter-dialog="true"
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
      tabIndex={-1}
      style={styles.dialog}
      onKeyDown={onDialogKeyDown}
    >
      <header data-handrail-bug-reporter-header="true" style={styles.header}>
        <div style={{ minWidth: 0 }}>
          <div style={{ marginBottom: 4, color: "var(--handrail-bug-accent)", fontSize: 10, fontWeight: 800, letterSpacing: "0.14em" }}>HELP US FIX IT</div>
          <h2 id={headingId} style={{ margin: 0, fontSize: 20, lineHeight: 1.2, letterSpacing: "-0.02em" }}>{heading}</h2>
          <div id={descriptionId} style={{ marginTop: 4, color: "var(--handrail-bug-muted-text)", fontSize: 12 }}>Describe the issue and review the attached context before sending.</div>
        </div>
        <button type="button" aria-label="Close bug reporter" disabled={reporter.submission.status === "submitting"} onClick={closeDialog} style={{ ...buttonStyle("secondary"), width: 38, minWidth: 38, height: 38, padding: 0, fontSize: 20, lineHeight: 1, opacity: reporter.submission.status === "submitting" ? 0.65 : 1 }}>×</button>
      </header>
      <div data-handrail-bug-reporter-content={tab} style={{ ...styles.content, ...(tab === "history" ? styles.historyContent : {}) }}>
        {showHistory && <div role="tablist" aria-label="Bug reporter views" data-handrail-bug-reporter-tabs="true" style={styles.tabs}>
          <button id={reportTabId} type="button" role="tab" aria-controls={reportPanelId} aria-selected={tab === "report"} tabIndex={tab === "report" ? 0 : -1} onClick={() => selectTab("report")} style={{ ...styles.tab, ...(tab === "report" ? styles.activeTab : {}) }}>Report a bug</button>
          <button id={historyTabId} type="button" role="tab" aria-controls={historyPanelId} aria-selected={tab === "history"} tabIndex={tab === "history" ? 0 : -1} onClick={() => selectTab("history")} style={{ ...styles.tab, ...(tab === "history" ? styles.activeTab : {}) }}>
            <span>My bugs</span>
            {historyCount !== null && <span aria-label={`${historyCount} total`} style={{ display: "inline-grid", placeItems: "center", minWidth: 22, height: 22, marginLeft: 8, padding: "0 6px", borderRadius: 999, color: tab === "history" ? "var(--handrail-bug-accent-text)" : "var(--handrail-bug-muted-text)", background: tab === "history" ? "color-mix(in srgb, var(--handrail-bug-accent-text) 18%, transparent)" : "var(--handrail-bug-surface-muted)", fontSize: 11 }}>{historyCount}</span>}
          </button>
        </div>}
        {tab === "report"
          ? <div id={reportPanelId} role={showHistory ? "tabpanel" : undefined} aria-labelledby={showHistory ? reportTabId : undefined} style={{ flex: "1 0 auto" }}><BugReportForm onCancel={closeDialog} /></div>
          : <div id={historyPanelId} role="tabpanel" aria-labelledby={historyTabId} style={{ display: "flex", width: "100%", minHeight: 0, flex: "1 1 auto" }}><BugHistory onClose={closeDialog} /></div>}
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
      style={style || { ...appearanceVariables(dialogProps.appearance, false), ...buttonStyle("primary") }}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => setOpen(true)}
    >
      {label}
    </button>
    <HandrailBugReporterDialog {...dialogProps} open={open} onClose={() => setOpen(false)} />
  </>;
}
