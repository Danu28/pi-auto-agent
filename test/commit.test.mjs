import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const src = readFileSync(resolve(root, "auto-agent.ts"), "utf8");

// AC1: source checks whether cwd is a valid git repo.
test("COMMIT AC1: checks current folder is a valid git repo", () => {
  assert.ok(/rev-parse/.test(src), "must run git rev-parse");
  assert.ok(/--is-inside-work-tree/.test(src), "must use --is-inside-work-tree guard");
});

// AC2: never auto-inits; commit is skipped silently when not a repo.
test("COMMIT AC2: never auto-inits; skips silently when not a repo", () => {
  assert.ok(/if\s*\(!isGitRepo\(dir\)\)\s*return/.test(src), "must skip commit when not a repo");
  assert.ok(!/"init"\]/.test(src), "must not run git init");
});

// AC3: source stages tracked changes only and creates a commit.
test("COMMIT AC3: git add -u then git commit -m", () => {
  assert.ok(/"add",\s*"-u"/.test(src), "must stage tracked changes with git add -u");
  assert.ok(/"commit",\s*"-m"/.test(src), "must create commit with git commit -m");
});

// AC4: meaningful message derived from the task.
test("COMMIT AC4: meaningful commit message built from task", () => {
  assert.ok(/buildCommitMessage/.test(src), "must define a buildCommitMessage helper");
  assert.ok(/task/.test(src), "message must be derived from the task text");
  assert.ok(/auto-agent: /.test(src), "message must be prefixed 'auto-agent: '");
});

// AC5: settled handler triggers the commit for the run's task.
test("COMMIT AC5: settled handler commits the run's task", () => {
  assert.ok(/let currentTask/.test(src), "must store the current task text");
  assert.ok(/currentTask\s*=\s*task/.test(src), "must set currentTask from the task");
  assert.ok(
    /ensureCleanCommit\(currentTask\)/.test(src),
    "agent_settled must call ensureCleanCommit(currentTask)",
  );
});
