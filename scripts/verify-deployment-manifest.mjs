import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

// Input: the JSON output of `vercel deploy --dry --json`.
// Check the actual upload set: ignore patterns alone can hide application APIs.
const manifestPath = process.argv[2];
assert.ok(manifestPath, "Pass the deployment dry-run JSON path.");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
assert.ok(Array.isArray(manifest.files), "Deployment file list is required.");
const paths = new Set(manifest.files.map((file) => file.path));
const privateRoots = new Set([
  "data",
  "outputs",
  "mobile",
  ".e2e-data",
  ".codex",
  ".agents",
  "test-results",
  "playwright-report",
  "blob-report",
]);
const forbidden = [...paths].filter(
  (file) =>
    typeof file !== "string" ||
    privateRoots.has(file.split("/")[0]) ||
    (path.basename(file).startsWith(".env") && file !== ".env.example") ||
    file.startsWith("src/generated/") ||
    /\.(?:pem|zip|tgz|tar\.gz|log|tsbuildinfo)$/.test(file),
);
assert.deepEqual(
  forbidden,
  [],
  "Private or generated files must not be uploaded.",
);
async function appFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const file = path.posix.join(directory, entry.name);
      return entry.isDirectory()
        ? appFiles(file)
        : entry.isFile()
          ? [file]
          : [];
    }),
  );
  return nested.flat();
}
const required = await appFiles("src/app");
assert.deepEqual(
  required.filter((file) => !paths.has(file)),
  [],
  "Application routes/assets are missing from the upload.",
);
console.log(
  `Deployment manifest verified: ${paths.size} files; all ${required.length} app files included; private files excluded.`,
);
