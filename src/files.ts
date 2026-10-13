import { constants } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";

const SUPPORTED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".tif",
  ".tiff",
  ".avif",
]);

export function isSupportedImage(path: string): boolean {
  return SUPPORTED_EXTENSIONS.has(extname(path).toLowerCase());
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function collectDirectory(dir: string, recursive: boolean): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory() && recursive) {
      files.push(...(await collectDirectory(path, recursive)));
    } else if (entry.isFile() && isSupportedImage(path)) {
      files.push(resolve(path));
    }
  }

  return files;
}

export async function collectInputFiles(input: string, recursive: boolean): Promise<string[]> {
  const absoluteInput = resolve(input);
  const info = await stat(absoluteInput);

  if (info.isFile()) {
    return isSupportedImage(absoluteInput) ? [absoluteInput] : [];
  }

  if (info.isDirectory()) {
    return collectDirectory(absoluteInput, recursive);
  }

  return [];
}

export function outputPathFor(inputFile: string, outputDir: string): string {
  return resolve(outputDir, basename(inputFile));
}
