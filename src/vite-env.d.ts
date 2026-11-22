/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" in the release-CSP E2E build only: keeps the dev probe (PLAN 15.1). */
  readonly VITE_E2E_PROBE?: string
}
