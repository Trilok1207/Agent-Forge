import { createHash, randomBytes } from "node:crypto";
import { createDb, schema, seedDemoProject } from "@agentflow/db";

/**
 * TEST-ONLY fixture: writes users and sessions straight into the e2e Postgres
 * database. This is how the signed-in suite gets a session without real OAuth
 * credentials; the application itself has no such path.
 */
export async function createSignedInUser(databaseUrl: string, name: string) {
  const handle = createDb({ url: databaseUrl });
  try {
    const email = `${name}-${randomBytes(4).toString("hex")}@example.com`;
    const [user] = await handle.db.insert(schema.users).values({ email, name }).returning();
    await handle.db
      .insert(schema.oauthAccounts)
      .values({ provider: "github", providerUserId: `e2e-${email}`, userId: user!.id });
    const [ws] = await handle.db
      .insert(schema.workspaces)
      .values({ name: `${name}'s workspace`, ownerUserId: user!.id })
      .returning();
    await handle.db
      .insert(schema.workspaceMembers)
      .values({ workspaceId: ws!.id, userId: user!.id, role: "owner" });
    const projectId = await seedDemoProject(handle.db, ws!.id);
    const sessions: string[] = [];
    for (let i = 0; i < 2; i++) {
      const token = randomBytes(32).toString("base64url");
      await handle.db.insert(schema.sessions).values({
        tokenHash: createHash("sha256").update(token).digest("hex"),
        userId: user!.id,
        userAgent:
          i === 0 ? "Mozilla/5.0 (Windows NT 10.0) Chrome/150 Safari/537" : "e2e-second-device",
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      });
      sessions.push(token);
    }
    return { email, workspaceId: ws!.id, projectId, token: sessions[0]!, otherToken: sessions[1]! };
  } finally {
    await handle.close();
  }
}
