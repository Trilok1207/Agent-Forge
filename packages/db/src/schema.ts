import type { RunInput, WorkflowSpec } from "@agentflow/contracts";
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  bigserial,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Lower-cased, verified email from the identity provider. */
  email: text("email").notNull().unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  createdAt: createdAt(),
});

export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    provider: text("provider", { enum: ["google", "github"] }).notNull(),
    providerUserId: text("provider_user_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.providerUserId] }),
    index("oauth_accounts_user_idx").on(t.userId),
  ],
);

/**
 * Server-side sessions. The cookie holds a random token; only its SHA-256 is
 * stored, so a database leak does not yield usable sessions.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_idx").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId),
  ],
);

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner"] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index("workspace_members_user_idx").on(t.userId),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    /** Demo projects hold synthetic data only and never get local grants (B12). */
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("projects_workspace_idx").on(t.workspaceId)],
);

export const projectItems = pgTable(
  "project_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    workflow: text("workflow", { enum: ["documents", "email", "repository"] }).notNull(),
    kind: text("kind", { enum: ["document", "email", "source"] }).notNull(),
    name: text("name").notNull(),
    sizeLabel: text("size_label").notNull(),
    preview: text("preview").notNull(),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("project_items_project_idx").on(t.projectId)],
);

/**
 * Append-only, hash-chained audit log (B10). Rows hold ids and decisions only,
 * never content, tokens, or keys. A DB trigger rejects UPDATE/DELETE/TRUNCATE.
 * Actor/workspace ids are plain values (no FKs) so deleting a user can never
 * rewrite history. Rows written before Session 3 have no hash (legacy prefix).
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seq: bigserial("seq", { mode: "number" }).notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actorUserId: uuid("actor_user_id"),
    workspaceId: uuid("workspace_id"),
    action: text("action").notNull(),
    detail: jsonb("detail")
      .$type<Record<string, string | number | boolean>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    prevHash: text("prev_hash"),
    hash: text("hash"),
  },
  (t) => [
    uniqueIndex("audit_events_seq_idx").on(t.seq),
    index("audit_events_actor_idx").on(t.actorUserId, t.at),
    index("audit_events_workspace_idx").on(t.workspaceId, t.seq),
  ],
);

const RUN_STATUSES = [
  "draft",
  "planned",
  "awaiting_plan_approval",
  "queued",
  "running",
  "awaiting_local_step",
  "awaiting_action_approval",
  "completed",
  "failed",
  "cancelled",
] as const;
const STEP_STATUSES = [
  "pending",
  "awaiting_approval",
  "succeeded",
  "failed",
  "rejected",
  "skipped",
] as const;
const WORKFLOW_KINDS = ["documents", "email", "repository"] as const;

export const workflowDefinitions = pgTable(
  "workflow_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    kind: text("kind", { enum: WORKFLOW_KINDS }).notNull(),
    isDemo: boolean("is_demo").notNull().default(false),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("workflow_definitions_workspace_key_idx").on(t.workspaceId, t.key)],
);

/** Immutable once written (DB trigger blocks UPDATE). New behaviour = new version. */
export const workflowVersions = pgTable(
  "workflow_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    definitionId: uuid("definition_id")
      .notNull()
      .references(() => workflowDefinitions.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    spec: jsonb("spec").$type<WorkflowSpec>().notNull(),
    specHash: text("spec_hash").notNull(),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("workflow_versions_definition_version_idx").on(t.definitionId, t.version)],
);

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    definitionId: uuid("definition_id")
      .notNull()
      .references(() => workflowDefinitions.id, { onDelete: "cascade" }),
    versionId: uuid("version_id")
      .notNull()
      .references(() => workflowVersions.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").notNull(),
    status: text("status", { enum: RUN_STATUSES }).notNull(),
    /** Incremented on every transition; transitions compare-and-set on it. */
    stateVersion: integer("state_version").notNull().default(0),
    input: jsonb("input").$type<RunInput>().notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    errorCode: text("error_code"),
    quotaReservationId: uuid("quota_reservation_id"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("workflow_runs_idempotency_idx").on(t.workspaceId, t.createdBy, t.idempotencyKey),
    index("workflow_runs_workspace_idx").on(t.workspaceId, t.createdAt),
  ],
);

export const runSteps = pgTable(
  "run_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    position: integer("position").notNull(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    status: text("status", { enum: STEP_STATUSES }).notNull().default("pending"),
    output: jsonb("output"),
    outputHash: text("output_hash"),
    errorCode: text("error_code"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("run_steps_run_key_idx").on(t.runId, t.key)],
);

export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    stepId: uuid("step_id").references(() => runSteps.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["plan", "action"] }).notNull(),
    status: text("status", { enum: ["pending", "approved", "rejected", "cancelled"] })
      .notNull()
      .default("pending"),
    title: text("title").notNull(),
    destination: text("destination"),
    content: text("content").notNull(),
    contentHash: text("content_hash").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBy: uuid("decided_by"),
    reason: text("reason"),
  },
  (t) => [
    // At most one plan approval per run and one approval per action step.
    uniqueIndex("approval_requests_plan_idx")
      .on(t.runId)
      .where(sql`kind = 'plan'`),
    uniqueIndex("approval_requests_step_idx")
      .on(t.stepId)
      .where(sql`kind = 'action'`),
  ],
);

/**
 * Quota hook ledger: reservations taken when a run is created and settled or
 * released when it ends. Records usage only; nothing is charged (billing is M13).
 */
export const quotaReservations = pgTable(
  "quota_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    kind: text("kind", { enum: ["run"] }).notNull(),
    amount: integer("amount").notNull(),
    status: text("status", { enum: ["reserved", "settled", "released"] })
      .notNull()
      .default("reserved"),
    usage: jsonb("usage").$type<Record<string, number>>(),
    createdAt: createdAt(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [index("quota_reservations_workspace_idx").on(t.workspaceId, t.createdAt)],
);
