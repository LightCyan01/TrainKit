export const SPANDREL_MODEL_EXTENSIONS = ["safetensors"];
export const NCNN_MODEL_EXTENSIONS = ["param"];
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "bmp", "webp"];
export const OUTPUT_FORMATS = ["JPG", "PNG", "BMP", "WebP"] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];
