import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const src = readFileSync(resolve(root, "auto-agent.ts"), "utf8");

// IMP AC1: honest token label (summed across turns, not a unique task total).
test("IMP AC1: completion notify labels tokens as summed across turns", () => {
  assert.ok(/summed across turns/.test(src), "must label tokens 'summed across turns'");
});

// IMP AC2: session_shutdown resets runActive (flag cannot stick across runs/aborts).
test("IMP AC2: session_shutdown resets runActive", () => {
  assert.ok(/pi\.on\(\s*"session_shutdown"/.test(src), "must register pi.on('session_shutdown')");
  assert.ok(/runActive\s*=\s*false/.test(src), "session_shutdown must reset runActive");
});

// IMP AC3: startRun() helper DRYs the reset; both commands use it.
test("IMP AC3: startRun() helper used by both commands", () => {
  assert.ok(/startRun\s*=\s*\(/.test(src), "must define a startRun helper");
  assert.ok(/startRun\(protocol\(task\)\)/.test(src), "auto-agent command must call startRun");
  assert.ok(/startRun\(resumePrompt\(\)\)/.test(src), "resume command must call startRun");
});

// IMP AC4: low-value "Auto-agent queued" notify removed.
test("IMP AC4: 'Auto-agent queued' notify removed", () => {
  assert.ok(!/Auto-agent queued/.test(src), "low-value 'queued' notify must be removed");
});
