import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const src = readFileSync(resolve(root, "auto-agent.ts"), "utf8");

// CS1: --commit flag parsed from /auto-agent args and stripped from task text.
test("CS1: parses --commit flag from /auto-agent args", () => {
  assert.ok(/--commit/.test(src), "must reference the --commit flag");
  const start = src.indexOf('registerCommand("auto-agent"');
  const end = src.indexOf('registerCommand("auto-agent-resume"');
  assert.ok(start >= 0 && end > start, "auto-agent handler must precede resume handler");
  const handler = src.slice(start, end);
  assert.ok(/\.replace\(/.test(handler), "handler must strip the flag from args via replace");
  assert.ok(/--commit\(\?=/.test(handler), "strip must target the standalone --commit token");
});

// CS2: git operations are opt-in; the settled handler guards on commitEnabled.
test("CS2: commit is opt-in (guarded by flag, default off)", () => {
  assert.ok(/commitEnabled/.test(src), "must track a commitEnabled state");
  assert.ok(
    /if\s*\(\s*commitEnabled\s*\)\s*ensureCleanCommit/.test(src),
    "agent_settled must call ensureCleanCommit only when commitEnabled",
  );
});

// CS3: tracked-only staging; never git add -A.
test("CS3: stages tracked changes only (git add -u, never -A)", () => {
  assert.ok(/"add",\s*"-u"/.test(src), "must stage with git add -u");
  assert.ok(!/"add",\s*"-A"/.test(src), "must NOT use git add -A");
});

// CS4: never auto-inits a git repo.
test("CS4: never auto-inits a git repo", () => {
  assert.ok(!/\["init"\]/.test(src), "must not run git init");
});

// CS5: resume reuses the stored currentTask (does not reset it).
test("CS5: resume does not reset currentTask", () => {
  const resumeIdx = src.indexOf('registerCommand("auto-agent-resume"');
  const settledIdx = src.indexOf('on("agent_settled"');
  assert.ok(resumeIdx >= 0 && settledIdx > resumeIdx, "resume handler must precede settled handler");
  const slice = src.slice(resumeIdx, settledIdx);
  assert.ok(!/currentTask\s*=/.test(slice), "resume must not reset currentTask");
});
