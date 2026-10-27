export { createDb, migrationsDir, type Db, type DbHandle } from "./client";
export { seedDemoProject } from "./seed";
export * as schema from "./schema";
export { and, asc, desc, eq, gt, gte, inArray, lt, ne, sql } from "drizzle-orm";
export {
  appendAuditEvent,
  auditHash,
  verifyAuditChain,
  type AuditDetail,
  type AuditEventInput,
  type ChainVerification,
} from "./audit";
