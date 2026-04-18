/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** WebSocket URL for the local TruthLens WhatsApp bridge, e.g. ws://127.0.0.1:7071 */
  readonly VITE_WHATSAPP_BRIDGE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
