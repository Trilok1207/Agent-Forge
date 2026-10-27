import type { WorkflowKind, WorkflowPlan } from "@agentflow/contracts";

export interface DemoFile {
  /** Synthetic display name. Demo files never map to real paths (B12). */
  name: string;
  kind: "document" | "email" | "source";
  sizeLabel: string;
  preview: string;
}

export interface DemoDocumentResult {
  type: "documents";
  summary: string[];
  table: { columns: string[]; rows: string[][] };
  saveAs: string;
}

export interface DemoEmailResult {
  type: "email";
  messages: {
    from: string;
    subject: string;
    category: "Action needed" | "FYI" | "Scheduling" | "Billing";
    summary: string;
    draft: string;
  }[];
}

export interface DemoRepoResult {
  type: "repository";
  findings: { severity: "high" | "medium" | "low"; title: string; detail: string }[];
  diff: string;
  saveAs: string;
}

export type DemoResult = DemoDocumentResult | DemoEmailResult | DemoRepoResult;

export interface DemoScenario {
  kind: WorkflowKind;
  label: string;
  tagline: string;
  inputs: DemoFile[];
  suggestedRequest: string;
  plan: WorkflowPlan;
  result: DemoResult;
}
