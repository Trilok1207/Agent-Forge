import type { Db } from "@agentflow/db";
import type { ProviderRegistry } from "./auth/providers";
import type { AuthState } from "./auth/session";
import type { Config } from "./config";

export interface Deps {
  db: Db;
  config: Config;
  providers: ProviderRegistry;
}

export interface AppEnv {
  Variables: { auth: AuthState | null };
}
