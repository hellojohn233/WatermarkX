export type WatermarkMode = "single" | "tile" | "diagonal";

export type WatermarkPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "center";

export interface AddOptions {
  input: string;
  out: string;
  text?: string;
  logo?: string;
  position: WatermarkPosition;
  mode: WatermarkMode;
  opacity: number;
  scale: number;
  fontSize: number;
  color: string;
  margin: number;
  rotate: number;
  spacing: number;
  recursive: boolean;
  overwrite: boolean;
  dryRun: boolean;
  json: boolean;
}

export interface FileResult {
  input: string;
  output?: string;
  status: "processed" | "skipped" | "failed" | "planned";
  reason?: string;
}

export interface BatchReport {
  input: string;
  outputDir: string;
  processed: number;
  skipped: number;
  failed: number;
  files: FileResult[];
}
