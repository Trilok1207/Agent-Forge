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
 * Append-only audit log. Stores ids and decisions, never content, tokens, or
 * keys. Hash chaining and DB-role restrictions arrive with M3 hardening (B10).
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    detail: jsonb("detail")
      .$type<Record<string, string | number | boolean>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (t) => [index("audit_events_actor_idx").on(t.actorUserId, t.at)],
);
