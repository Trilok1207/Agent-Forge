import type { Db } from "@agentflow/db";
import type { StepExecutor } from "@agentflow/workflow";
import type { ProviderRegistry } from "./auth/providers";
import type { AuthState } from "./auth/session";
import type { Config } from "./config";
import type { QuotaHooks } from "./quota";

export interface Deps {
  db: Db;
  config: Config;
  providers: ProviderRegistry;
  quota: QuotaHooks;
  executor: StepExecutor;
}

export interface AppEnv {
  Variables: { auth: AuthState | null };
}
