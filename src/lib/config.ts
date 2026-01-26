//Backend API base URL
export const BACKEND_URL = "http://127.0.0.1:8000";

//WebSocket base URL
export const WS_URL = "ws://127.0.0.1:8000";

export const MODEL_FILE_EXTENSIONS = [
  "safetensors",
  "pth",
  "pt",
  "bin",
  "ckpt",
];

export const OUTPUT_FORMATS = ["JPG", "PNG", "WebP"] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];
