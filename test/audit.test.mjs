import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const src = readFileSync(resolve(root, "auto-agent.ts"), "utf8");
const pkgPath = resolve(root, "package.json");
const reqPath = resolve(root, "Requirements.txt");

// B1: `sendUserMessage` must not be awaited. This is a pi-run ordering property
// that is not observable through the mock harness, so it stays as a source guard
// (the audit's behavioral-conversion goal does not apply to it).
test("B1: pi.sendUserMessage is present and not awaited", () => {
  assert.ok(/pi\.sendUserMessage\(/.test(src), "sendUserMessage call must still exist");
  assert.ok(!/await\s+pi\.sendUserMessage/.test(src), "must NOT await sendUserMessage (B1)");
});

// B4: package.json declares the pi dependency; Requirements.txt is gone/populated.
// These read real files, not implementation text — not brittle.
test("B4: package.json declares @earendil-works/pi-coding-agent", () => {
  assert.ok(existsSync(pkgPath), "package.json must exist (B4)");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  assert.ok(
    "@earendil-works/pi-coding-agent" in deps,
    "package.json must declare @earendil-works/pi-coding-agent (B4)",
  );
});
test("B4: Requirements.txt removed or populated", () => {
  const gone = !existsSync(reqPath);
  const populated = existsSync(reqPath) && readFileSync(reqPath, "utf8").trim() !== "";
  assert.ok(gone || populated, "Requirements.txt must be removed or non-empty (B4)");
});
