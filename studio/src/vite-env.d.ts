/// <reference types="vite/client" />

// No secrets are exposed to the client bundle: LLM / image keys live only in server env
// (see server/core/config.ts). Intentionally no VITE_* key variables here.
