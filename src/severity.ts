export const BUG_IMPACTS = Object.freeze([
  "critical",
  "high",
  "moderate",
  "low",
] as const);

export const HANDRAIL_BUG_SEVERITIES = Object.freeze([
  "sev1",
  "sev2",
  "sev3",
  "sev4",
] as const);

export type BugImpact = (typeof BUG_IMPACTS)[number];
export type HandrailBugSeverity = (typeof HANDRAIL_BUG_SEVERITIES)[number];

export interface BugSeverityOption {
  readonly label: "Critical" | "High" | "Moderate" | "Low";
  readonly impact: BugImpact;
  readonly handrailSeverity: HandrailBugSeverity;
}

export const BUG_SEVERITY_OPTIONS: readonly BugSeverityOption[] = Object.freeze([
  Object.freeze({ label: "Critical", impact: "critical", handrailSeverity: "sev1" }),
  Object.freeze({ label: "High", impact: "high", handrailSeverity: "sev2" }),
  Object.freeze({ label: "Moderate", impact: "moderate", handrailSeverity: "sev3" }),
  Object.freeze({ label: "Low", impact: "low", handrailSeverity: "sev4" }),
]);

const BUG_SEVERITY_BY_ALIAS = new Map<string, BugSeverityOption>();
for (const option of BUG_SEVERITY_OPTIONS) {
  for (const alias of [
    option.label,
    option.impact,
    option.handrailSeverity,
    ...(option.impact === "moderate" ? ["medium"] : []),
  ]) {
    BUG_SEVERITY_BY_ALIAS.set(alias.toLowerCase(), option);
  }
}

export function bugSeverityOption(value: unknown): BugSeverityOption | null {
  if (typeof value !== "string") return null;
  return BUG_SEVERITY_BY_ALIAS.get(value.trim().toLowerCase()) || null;
}

export function normalizeBugImpact(value: unknown): BugImpact | null {
  return bugSeverityOption(value)?.impact || null;
}

export function handrailBugSeverity(value: unknown): HandrailBugSeverity | null {
  return bugSeverityOption(value)?.handrailSeverity || null;
}

export function bugImpactLabel(value: unknown): BugSeverityOption["label"] | null {
  return bugSeverityOption(value)?.label || null;
}
