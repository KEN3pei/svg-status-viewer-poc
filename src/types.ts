export type StatusState = "ok" | "warning" | "alert" | "unknown";

export type AppearancePreset = "running" | "ok" | "warning" | "alert" | "unknown" | "flow" | string;

export type StatusItemKind = "component" | "edge" | string;

export interface StatusAppearance {
  preset?: AppearancePreset;
}

export interface StatusResource {
  source?: string;
  kind?: string;
  id?: string;
  name?: string;
  namespace?: string;
  [key: string]: unknown;
}

export interface StatusCheck {
  id: string;
  state: StatusState;
  message?: string;
  source?: string;
  details?: Record<string, unknown>;
}

export interface StatusAggregation {
  rule: string;
  summary?: Partial<Record<StatusState, number>>;
  [key: string]: unknown;
}

export interface StatusItem {
  id: string;
  kind?: StatusItemKind;
  state: StatusState | string;
  reason?: string;
  message?: string;
  source?: string;
  observedAt?: string;
  appearance?: StatusAppearance;
  resource?: StatusResource;
  details?: Record<string, unknown>;
  checks?: StatusCheck[];
  aggregation?: StatusAggregation;
}

export interface StatusDocument {
  generatedAt?: string;
  collector?: {
    source?: string;
    state?: StatusState | string;
    message?: string;
  };
  items?: StatusItem[];
  components?: StatusItem[];
}

export interface StateStyle {
  color: string;
  label: string;
}

export interface ApplyStatusResult {
  applied: string[];
  missing: string[];
}
