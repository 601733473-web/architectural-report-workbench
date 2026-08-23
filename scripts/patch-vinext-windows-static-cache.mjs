import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const target = path.resolve(
  "node_modules/vinext/dist/server/static-file-cache.js",
);
const original =
  'relativePath: path.relative(base, batch[j]),';
const patched =
  'relativePath: path.relative(base, batch[j]).split(path.sep).join("/"),';

let source;

try {
  source = await readFile(target, "utf8");
} catch (error) {
  if (error?.code === "ENOENT") {
    console.warn("[vinext patch] Dependency file not found; skipping.");
    process.exit(0);
  }

  throw error;
}

if (source.includes(patched)) {
  console.log("[vinext patch] Windows static asset paths already normalized.");
  process.exit(0);
}

if (!source.includes(original)) {
  throw new Error(
    "[vinext patch] Expected static cache implementation was not found. " +
      "Review the patch before upgrading vinext.",
  );
}

await writeFile(target, source.replace(original, patched), "utf8");
console.log("[vinext patch] Normalized Windows static asset paths.");
