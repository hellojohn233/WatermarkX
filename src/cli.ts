#!/usr/bin/env node

import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { Command, InvalidArgumentError } from "commander";

import { collectInputFiles, outputPathFor, pathExists } from "./files.js";
import type { AddOptions, BatchReport, FileResult, WatermarkMode, WatermarkPosition } from "./types.js";
import { applyWatermark } from "./watermark.js";

function parseNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new InvalidArgumentError("Expected a number");
  }
  return parsed;
}

function parseOpacity(value: string): number {
  const parsed = parseNumber(value);
  if (parsed < 0 || parsed > 1) {
    throw new InvalidArgumentError("Opacity must be between 0 and 1");
  }
  return parsed;
}

function assertPosition(value: string): WatermarkPosition {
  const allowed = ["top-left", "top-right", "bottom-left", "bottom-right", "center"];
  if (!allowed.includes(value)) {
    throw new InvalidArgumentError(`Position must be one of: ${allowed.join(", ")}`);
  }
  return value as WatermarkPosition;
}

function assertMode(value: string): WatermarkMode {
  const allowed = ["single", "tile", "diagonal"];
  if (!allowed.includes(value)) {
    throw new InvalidArgumentError(`Mode must be one of: ${allowed.join(", ")}`);
  }
  return value as WatermarkMode;
}

function buildOptions(input: string, rawOptions: Record<string, unknown>): AddOptions {
  const text = rawOptions.text as string | undefined;
  const logo = rawOptions.logo as string | undefined;

  if (!text && !logo) {
    throw new Error("Provide either --text or --logo");
  }

  if (text && logo) {
    throw new Error("Use only one watermark source at a time: --text or --logo");
  }

  const mode = assertMode((rawOptions.mode as string | undefined) ?? "single");
  if (logo && mode !== "single") {
    throw new Error("Logo watermarks currently support --mode single only");
  }

  return {
    input,
    out: resolve((rawOptions.out as string | undefined) ?? "watermarkx-output"),
    position: assertPosition((rawOptions.position as string | undefined) ?? "bottom-right"),
    mode,
    opacity: rawOptions.opacity as number,
    scale: rawOptions.scale as number,
    fontSize: rawOptions.fontSize as number,
    color: rawOptions.color as string,
    margin: rawOptions.margin as number,
    rotate: rawOptions.rotate as number,
    spacing: rawOptions.spacing as number,
    recursive: Boolean(rawOptions.recursive),
    overwrite: Boolean(rawOptions.overwrite),
    dryRun: Boolean(rawOptions.dryRun),
    json: Boolean(rawOptions.json),
    ...(text ? { text } : {}),
    ...(logo ? { logo: resolve(logo) } : {}),
  };
}

function printHumanReport(report: BatchReport): void {
  console.log(`Input: ${report.input}`);
  console.log(`Output: ${report.outputDir}`);
  console.log(`Processed: ${report.processed}`);
  console.log(`Skipped: ${report.skipped}`);
  console.log(`Failed: ${report.failed}`);

  for (const file of report.files) {
    if (file.status === "processed" || file.status === "planned") {
      console.log(`- ${file.status}: ${file.input} -> ${file.output}`);
    } else {
      console.log(`- ${file.status}: ${file.input}${file.reason ? ` (${file.reason})` : ""}`);
    }
  }
}

async function addCommand(input: string, rawOptions: Record<string, unknown>): Promise<void> {
  const options = buildOptions(input, rawOptions);
  const files = await collectInputFiles(input, options.recursive);
  await mkdir(options.out, { recursive: true });

  const results: FileResult[] = [];

  for (const file of files) {
    const output = outputPathFor(file, options.out);

    if (!options.overwrite && (await pathExists(output))) {
      results.push({ input: file, output, status: "skipped", reason: "Output already exists" });
      continue;
    }

    if (options.dryRun) {
      results.push({ input: file, output, status: "planned" });
      continue;
    }

    try {
      await applyWatermark(file, output, options);
      results.push({ input: file, output, status: "processed" });
    } catch (error) {
      results.push({
        input: file,
        output,
        status: "failed",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const report: BatchReport = {
    input,
    outputDir: options.out,
    processed: results.filter((file) => file.status === "processed").length,
    skipped: results.filter((file) => file.status === "skipped").length,
    failed: results.filter((file) => file.status === "failed").length,
    files: results,
  };

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report);
  }

  if (report.failed > 0) {
    process.exitCode = 1;
  }
}

const program = new Command();

program
  .name("watermarkx")
  .description("AI-friendly CLI for batch watermarking existing images without regenerating them.")
  .version("0.1.0")
  .showHelpAfterError()
  .addHelpText(
    "after",
    `
Principles:
  WatermarkX modifies existing image files only. It does not generate or recreate images.
  Source images are never changed in place; outputs are written to a separate directory.

Common workflows:
  watermarkx add ./photos --text "Demo" --out ./out
  watermarkx add ./photos --logo ./logo.png --position bottom-right --out ./out
  watermarkx add ./photos --text "CONFIDENTIAL" --mode tile --opacity 0.12 --out ./out

For AI agents and scripts:
  Use --dry-run before writing files when the request is ambiguous.
  Use --json when another program needs to read the processing report.
`,
  );

program
  .command("add")
  .description("Add a visible text or logo watermark to an image file or a directory of images.")
  .argument("<input>", "Image file or directory to process. Supported formats: jpg, png, webp, tiff, avif.")
  .option("--out <dir>", "Directory for watermarked files. Source files are not modified.", "watermarkx-output")
  .option("--text <text>", "Text to draw as the watermark. Cannot be used together with --logo.")
  .option("--logo <path>", "Image file to use as a logo watermark. Cannot be used together with --text.")
  .option(
    "--position <position>",
    "Placement for single text or logo watermarks: top-left, top-right, bottom-left, bottom-right, center.",
    "bottom-right",
  )
  .option(
    "--mode <mode>",
    "Watermark layout: single places one watermark, tile repeats text across the image, diagonal places large centered text.",
    "single",
  )
  .option("--opacity <number>", "Watermark opacity from 0 to 1. Lower values are more subtle.", parseOpacity, 0.35)
  .option("--scale <number>", "Logo width as a fraction of the base image width. Example: 0.18 means 18%.", parseNumber, 0.18)
  .option("--font-size <number>", "Text size in pixels for text, tile, and diagonal modes.", parseNumber, 48)
  .option("--color <css-color>", "Text color in any SVG/CSS color format, such as #ffffff or rgba(255,255,255,0.7).", "#ffffff")
  .option("--margin <number>", "Distance in pixels from the chosen edge for single watermarks.", parseNumber, 32)
  .option("--rotate <number>", "Rotation angle in degrees. Useful for diagonal or branded text watermarks.", parseNumber, 0)
  .option("--spacing <number>", "Distance in pixels between repeated text watermarks in tile mode.", parseNumber, 240)
  .option("--recursive", "When input is a directory, also process supported images in nested folders.", false)
  .option("--overwrite", "Replace output files if they already exist. Without this flag, existing outputs are skipped.", false)
  .option("--dry-run", "Show the files that would be processed without writing any images.", false)
  .option("--json", "Print a machine-readable JSON report for AI agents, scripts, and CI jobs.", false)
  .addHelpText(
    "after",
    `
Watermark sources:
  Provide exactly one of --text or --logo.
  --text is best for labels such as "CONFIDENTIAL", "Demo", or copyright marks.
  --logo is best for brand marks, signatures, or transparent PNG overlays.

Modes:
  single    Draw one watermark at --position.
  tile      Repeat text across the full image. Works with --text only.
  diagonal  Draw large centered text, usually with --rotate -30 or the default diagonal angle.

Examples:
  Add a subtle text watermark to every image in a folder:
    watermarkx add ./photos --text "© John Wick" --position bottom-right --opacity 0.35 --out ./out

  Add a logo watermark scaled to 18% of each image width:
    watermarkx add ./photos --logo ./logo.png --position bottom-right --scale 0.18 --opacity 0.5 --out ./out

  Add a tiled confidential watermark:
    watermarkx add ./photos --text "CONFIDENTIAL" --mode tile --rotate -30 --opacity 0.12 --spacing 240 --out ./out

  Preview work without writing files:
    watermarkx add ./photos --text "Demo" --out ./out --dry-run

  Produce JSON for an AI agent or script:
    watermarkx add ./photos --text "Demo" --out ./out --json

Notes:
  WatermarkX never edits source files in place.
  Existing output files are skipped unless --overwrite is provided.
  Smart subject-aware placement is not implemented yet; choose an explicit --position for now.
`,
  )
  .action((input, options) => {
    addCommand(input, options).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
  });

program.parse();
