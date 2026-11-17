import { and, eq, schema, type Db } from "@agentflow/db";
import {
  createKeyVault,
  createMockProvider,
  createModelGateway,
  ModelError,
  type CredentialResolver,
  type GatewayLog,
  type KeyVault,
  type ModelGateway,
  type ModelProvider,
  type TokenBudget,
} from "@agentflow/models";
import { mockPlannerResponse } from "@agentflow/workflow";
import type { Config } from "../config";
import { ledgerTokenBudget } from "../quota";

export interface ModelsDeps {
  gateway: ModelGateway;
  providers: Readonly<Record<string, ModelProvider>>;
  defaultProvider: string;
  /** Null when BYOK_KEK is not configured: BYOK is then unavailable (fail closed). */
  vault: KeyVault | null;
}

export const credentialAad = (workspaceId: string, provider: string) =>
  `${workspaceId}:${provider}`;

/**
 * Hosted: the platform key for the provider (none needed for the mock).
 * BYOK: the workspace's stored key, decrypted in memory for this one call.
 * Keys never leave this process.
 */
export function createCredentialResolver(db: Db, vault: KeyVault | null): CredentialResolver {
  return {
    async resolve({ workspaceId, providerId, mode }) {
      if (mode === "hosted") return null; // Real providers will read their platform key from the secret store here (D2/D6).
      if (!vault) throw new ModelError("not_configured", "BYOK is not configured");
      const [row] = await db
        .select()
        .from(schema.modelCredentials)
        .where(
          and(
            eq(schema.modelCredentials.workspaceId, workspaceId),
            eq(schema.modelCredentials.provider, providerId),
          ),
        );
      if (!row) throw new ModelError("not_configured", "No key stored for this provider");
      try {
        return vault.decrypt(row, credentialAad(workspaceId, providerId));
      } catch {
        throw new ModelError("not_configured", "Stored key could not be decrypted");
      }
    },
  };
}

/** The deterministic mock planner provider (the only provider until D2 is decided). */
export function mockPlannerProvider(): ModelProvider {
  return createMockProvider({
    respond: (req) => mockPlannerResponse(req.messages.at(-1)?.content ?? ""),
  });
}

export function createModelsDeps(
  db: Db,
  config: Config,
  opts: {
    providers?: Record<string, ModelProvider>;
    budget?: TokenBudget;
    log?: GatewayLog;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): ModelsDeps {
  const vault = config.models.byokKek
    ? createKeyVault({ kek: config.models.byokKek, kekId: config.models.byokKekId })
    : null;
  const providers = opts.providers ?? { mock: mockPlannerProvider() };
  const gateway = createModelGateway({
    providers,
    credentials: createCredentialResolver(db, vault),
    budget:
      opts.budget ?? ledgerTokenBudget(db, { monthlyTokenLimit: config.models.tokensPerMonth }),
    limits: { timeoutMs: config.models.timeoutMs, maxAttempts: config.models.maxAttempts },
    log: opts.log,
    sleep: opts.sleep,
  });
  return {
    gateway,
    providers,
    defaultProvider: Object.keys(providers)[0] ?? config.models.provider,
    vault,
  };
}
