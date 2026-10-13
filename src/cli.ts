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

  return {
    input,
    out: resolve((rawOptions.out as string | undefined) ?? "watermarkx-output"),
    position: assertPosition((rawOptions.position as string | undefined) ?? "bottom-right"),
    mode: assertMode((rawOptions.mode as string | undefined) ?? "single"),
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
  .version("0.1.0");

program
  .command("add")
  .description("Add a visible watermark to an image file or directory.")
  .argument("<input>", "Input image file or directory")
  .option("--out <dir>", "Output directory", "watermarkx-output")
  .option("--text <text>", "Text watermark")
  .option("--logo <path>", "Logo image watermark")
  .option("--position <position>", "top-left | top-right | bottom-left | bottom-right | center", "bottom-right")
  .option("--mode <mode>", "single | tile | diagonal", "single")
  .option("--opacity <number>", "Opacity from 0 to 1", parseOpacity, 0.35)
  .option("--scale <number>", "Logo width as a fraction of base image width", parseNumber, 0.18)
  .option("--font-size <number>", "Text watermark font size", parseNumber, 48)
  .option("--color <css-color>", "Text color", "#ffffff")
  .option("--margin <number>", "Margin in pixels", parseNumber, 32)
  .option("--rotate <number>", "Rotation angle in degrees", parseNumber, 0)
  .option("--spacing <number>", "Tile spacing in pixels", parseNumber, 240)
  .option("--recursive", "Recursively process input directories", false)
  .option("--overwrite", "Overwrite existing output files", false)
  .option("--dry-run", "Print planned work without writing files", false)
  .option("--json", "Print a JSON report", false)
  .action((input, options) => {
    addCommand(input, options).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
  });

program.parse();
