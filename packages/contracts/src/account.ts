import { z } from "zod";

export const AuthProviderId = z.enum(["google", "github"]);
export type AuthProviderId = z.infer<typeof AuthProviderId>;

/** Public provider status. Never includes client ids or secrets. */
export const ProvidersResponse = z.object({
  providers: z.array(z.object({ id: AuthProviderId, configured: z.boolean() })),
});
export type ProvidersResponse = z.infer<typeof ProvidersResponse>;

export const WorkspaceRole = z.enum(["owner"]);

export const WorkspaceSummary = z.object({
  id: z.string().uuid(),
  name: z.string(),
  role: WorkspaceRole,
});
export type WorkspaceSummary = z.infer<typeof WorkspaceSummary>;

export const MeResponse = z.object({
  user: z.object({
    id: z.string().uuid(),
    email: z.string(),
    name: z.string().nullable(),
    avatarUrl: z.string().nullable(),
  }),
  linkedProviders: z.array(AuthProviderId),
  workspaces: z.array(WorkspaceSummary),
});
export type MeResponse = z.infer<typeof MeResponse>;

export const SessionInfo = z.object({
  id: z.string().uuid(),
  createdAt: z.string(),
  expiresAt: z.string(),
  userAgent: z.string().nullable(),
  current: z.boolean(),
});
export type SessionInfo = z.infer<typeof SessionInfo>;
export const SessionsResponse = z.object({ sessions: z.array(SessionInfo) });
export type SessionsResponse = z.infer<typeof SessionsResponse>;

export const ProjectSummary = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  isDemo: z.boolean(),
  itemCount: z.number().int(),
});
export type ProjectSummary = z.infer<typeof ProjectSummary>;

export const WorkspaceDetail = WorkspaceSummary.extend({ projects: z.array(ProjectSummary) });
export type WorkspaceDetail = z.infer<typeof WorkspaceDetail>;
export const WorkspacesResponse = z.object({ workspaces: z.array(WorkspaceSummary) });
export type WorkspacesResponse = z.infer<typeof WorkspacesResponse>;

export const ProjectItem = z.object({
  id: z.string().uuid(),
  workflow: z.enum(["documents", "email", "repository"]),
  kind: z.enum(["document", "email", "source"]),
  name: z.string(),
  sizeLabel: z.string(),
  preview: z.string(),
});
export type ProjectItem = z.infer<typeof ProjectItem>;

export const ProjectDetail = ProjectSummary.omit({ itemCount: true }).extend({
  workspaceId: z.string().uuid(),
  items: z.array(ProjectItem),
});
export type ProjectDetail = z.infer<typeof ProjectDetail>;

export const AuditEvent = z.object({
  id: z.string().uuid(),
  at: z.string(),
  action: z.string(),
  detail: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});
export type AuditEvent = z.infer<typeof AuditEvent>;
export const AuditResponse = z.object({ events: z.array(AuditEvent) });
export type AuditResponse = z.infer<typeof AuditResponse>;

/** Error codes the sign-in page knows how to explain. */
export const SignInErrorCode = z.enum([
  "provider_not_configured",
  "oauth_state",
  "access_denied",
  "oauth_exchange",
  "email_unverified",
  "account_exists",
  "account_linked_elsewhere",
  "signin_required",
]);
export type SignInErrorCode = z.infer<typeof SignInErrorCode>;
