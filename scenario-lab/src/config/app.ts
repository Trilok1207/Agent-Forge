/**
 * Application-level configuration. Values come from Vite env variables
 * (see `.env.example`) so the working title can change without code edits.
 */
export const appConfig = {
  name: (import.meta.env.VITE_APP_NAME as string | undefined)?.trim() || 'Scenario Lab',
  storageNamespace: 'scenarioLab',
} as const;
