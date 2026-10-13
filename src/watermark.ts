import { readFile } from "node:fs/promises";
import sharp from "sharp";

import type { AddOptions, WatermarkPosition } from "./types.js";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function positionCoordinates(
  position: WatermarkPosition,
  baseWidth: number,
  baseHeight: number,
  overlayWidth: number,
  overlayHeight: number,
  margin: number,
): { left: number; top: number } {
  switch (position) {
    case "top-left":
      return { left: margin, top: margin };
    case "top-right":
      return { left: baseWidth - overlayWidth - margin, top: margin };
    case "bottom-left":
      return { left: margin, top: baseHeight - overlayHeight - margin };
    case "center":
      return {
        left: Math.round((baseWidth - overlayWidth) / 2),
        top: Math.round((baseHeight - overlayHeight) / 2),
      };
    case "bottom-right":
    default:
      return {
        left: baseWidth - overlayWidth - margin,
        top: baseHeight - overlayHeight - margin,
      };
  }
}

function textOverlaySvg(width: number, height: number, options: AddOptions): Buffer {
  const text = escapeXml(options.text ?? "");
  const fontSize = options.fontSize;
  const estimatedWidth = Math.max(Math.round(text.length * fontSize * 0.62), fontSize * 4);
  const overlayHeight = Math.round(fontSize * 1.45);
  const { left, top } = positionCoordinates(
    options.position,
    width,
    height,
    estimatedWidth,
    overlayHeight,
    options.margin,
  );

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <text
        x="${left}"
        y="${top + fontSize}"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${fontSize}"
        font-weight="700"
        fill="${options.color}"
        opacity="${options.opacity}"
        transform="rotate(${options.rotate}, ${left + estimatedWidth / 2}, ${top + overlayHeight / 2})"
      >${text}</text>
    </svg>
  `;

  return Buffer.from(svg);
}

function tiledTextOverlaySvg(width: number, height: number, options: AddOptions): Buffer {
  const text = escapeXml(options.text ?? "");
  const fontSize = options.fontSize;
  const spacing = options.spacing;
  const rows: string[] = [];

  for (let y = -spacing; y < height + spacing; y += spacing) {
    for (let x = -spacing; x < width + spacing; x += spacing) {
      rows.push(`
        <text
          x="${x}"
          y="${y}"
          font-family="Arial, Helvetica, sans-serif"
          font-size="${fontSize}"
          font-weight="700"
          fill="${options.color}"
          opacity="${options.opacity}"
          transform="rotate(${options.rotate}, ${x}, ${y})"
        >${text}</text>
      `);
    }
  }

  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${rows.join("")}</svg>`);
}

function diagonalTextOverlaySvg(width: number, height: number, options: AddOptions): Buffer {
  const text = escapeXml(options.text ?? "");
  const fontSize = options.fontSize;
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <text
        x="${width / 2}"
        y="${height / 2}"
        text-anchor="middle"
        dominant-baseline="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${fontSize}"
        font-weight="800"
        fill="${options.color}"
        opacity="${options.opacity}"
        transform="rotate(${options.rotate || -32}, ${width / 2}, ${height / 2})"
      >${text}</text>
    </svg>
  `;

  return Buffer.from(svg);
}

async function logoOverlaySvg(width: number, height: number, options: AddOptions): Promise<Buffer> {
  if (!options.logo) throw new Error("Logo path is required");

  const targetWidth = Math.max(1, Math.round(width * options.scale));
  const logoPng = await sharp(await readFile(options.logo)).resize({ width: targetWidth }).png().toBuffer();
  const logoMeta = await sharp(logoPng).metadata();
  const logoWidth = logoMeta.width ?? targetWidth;
  const logoHeight = logoMeta.height ?? targetWidth;
  const { left, top } = positionCoordinates(
    options.position,
    width,
    height,
    logoWidth,
    logoHeight,
    options.margin,
  );

  const href = `data:image/png;base64,${logoPng.toString("base64")}`;
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <image
        href="${href}"
        x="${left}"
        y="${top}"
        width="${logoWidth}"
        height="${logoHeight}"
        opacity="${options.opacity}"
        transform="rotate(${options.rotate}, ${left + logoWidth / 2}, ${top + logoHeight / 2})"
      />
    </svg>
  `;

  return Buffer.from(svg);
}

async function buildOverlay(input: string, options: AddOptions): Promise<Buffer> {
  const metadata = await sharp(input).metadata();
  const width = metadata.width;
  const height = metadata.height;

  if (!width || !height) {
    throw new Error("Could not read image dimensions");
  }

  if (options.logo) return logoOverlaySvg(width, height, options);
  if (options.mode === "tile") return tiledTextOverlaySvg(width, height, options);
  if (options.mode === "diagonal") return diagonalTextOverlaySvg(width, height, options);
  return textOverlaySvg(width, height, options);
}

export async function applyWatermark(input: string, output: string, options: AddOptions): Promise<void> {
  const overlay = await buildOverlay(input, options);
  await sharp(input)
    .rotate()
    .composite([{ input: overlay, top: 0, left: 0 }])
    .toFile(output);
}
