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

// --- B1 fixed: no `await` before pi.sendUserMessage, but the call still exists ---
test("B1 fixed: pi.sendUserMessage is not awaited", () => {
  assert.ok(/pi\.sendUserMessage\(/.test(src), "sendUserMessage call must still exist");
  assert.ok(!/await\s+pi\.sendUserMessage/.test(src), "must NOT await sendUserMessage (B1)");
});

// --- B2 fixed: both sendUserMessage calls pass deliverAs ---
test("B2 fixed: sendUserMessage passes deliverAs", () => {
  const sendLines = src.split("\n").filter((l) => l.includes("pi.sendUserMessage("));
  assert.ok(sendLines.length >= 1, "expected at least 1 sendUserMessage call with deliverAs");
  for (const l of sendLines) {
    assert.ok(/deliverAs/.test(l), `sendUserMessage call must pass deliverAs: ${l.trim()}`);
  }
});

// --- B3 fixed: no misleading 'started'; low-value 'queued' notify removed by improvement ---
test("B3 fixed: no 'started' notify; low-value 'queued' notify removed", () => {
  assert.ok(!/ctx\.ui\.notify\(`Auto-agent started/.test(src), "must not say 'started' (B3)");
  assert.ok(!/Auto-agent queued/.test(src), "low-value 'queued' notify removed (improvement)");
});

// --- B4 fixed: package.json declares dep; Requirements.txt gone/non-empty ---
test("B4 fixed: package.json declares @earendil-works/pi-coding-agent", () => {
  assert.ok(existsSync(pkgPath), "package.json must exist (B4)");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  assert.ok(
    "@earendil-works/pi-coding-agent" in deps,
    "package.json must declare @earendil-works/pi-coding-agent (B4)",
  );
});
test("B4 fixed: Requirements.txt removed or populated", () => {
  const gone = !existsSync(reqPath);
  const populated = existsSync(reqPath) && readFileSync(reqPath, "utf8").trim() !== "";
  assert.ok(gone || populated, "Requirements.txt must be removed or non-empty (B4)");
});

// --- B5 fixed: args.trim() used (no optional chaining) ---
test("B5 fixed: args.trim() used (no ?.)", () => {
  assert.ok(!/args\?\.trim\(\)/.test(src), "must not use args?.trim() (B5)");
  assert.ok(/const task = args\.trim\(\)/.test(src), "should use args.trim() (B5)");
});

// (Historical audit findings lived in .auto-agent/findings.md, which is agent
// scratch and not shipped. The B1–B5 source checks below remain the proof of fix.)
