import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function git(args) {
  return execSync(`git ${args}`, { cwd: root, encoding: "utf8" }).trim();
}

// AC1: README documents the completion feature (API calls + tokens).
test("REPO AC1: README documents API-call + token feature", () => {
  const readme = existsSync(resolve(root, "README.md"))
    ? readFileSync(resolve(root, "README.md"), "utf8")
    : "";
  assert.ok(/API call/i.test(readme), "README must mention API calls");
  assert.ok(/token/i.test(readme), "README must mention tokens");
});

// AC2: unwanted scratch (.auto-agent) removed.
test("REPO AC2: .auto-agent scratch removed", () => {
  assert.ok(!existsSync(resolve(root, ".auto-agent")), ".auto-agent must be removed");
});

// AC3 + AC5: git repo with origin remote at github.
test("REPO AC3/AC5: git repo has origin remote on github", () => {
  git("rev-parse --is-inside-work-tree"); // throws if not a repo
  const url = git("remote get-url origin");
  assert.ok(url.length > 0, "origin remote must exist");
  assert.ok(/github\.com/.test(url), `origin must be a github URL (got ${url})`);
});

// AC4: at least one commit exists.
test("REPO AC4: at least one commit exists", () => {
  const log = git("log --oneline");
  assert.ok(log.split("\n").filter(Boolean).length >= 1, "must have >=1 commit");
});
