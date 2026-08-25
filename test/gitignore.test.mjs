import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { ensureGitignore } from "../auto-agent.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(__dirname, "..", "auto-agent.ts"), "utf8");

function freshGitRepo() {
  const dir = mkdtempSync(join(tmpdir(), "auto-agent-gi-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@t.t"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
  return dir;
}
function plainDir() {
  return mkdtempSync(join(tmpdir(), "auto-agent-nogit-"));
}
function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}
function ignored(dir, p) {
  try {
    execFileSync("git", ["check-ignore", p], { cwd: dir, stdio: ["ignore", "ignore", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

// AC1: existing .gitignore without the entry -> entry added and git-confirmed ignored.
test("AC1: ensureGitignore adds .auto-agent/ to an existing .gitignore that lacks it", () => {
  const dir = freshGitRepo();
  try {
    writeFileSync(join(dir, ".gitignore"), "node_modules/\n");
    ensureGitignore(dir);
    const content = readFileSync(join(dir, ".gitignore"), "utf8");
    assert.ok(content.includes(".auto-agent/"), "entry must be added to .gitignore");
    assert.ok(ignored(dir, ".auto-agent/plan.md"), "git must ignore .auto-agent/ entries");
  } finally {
    cleanup(dir);
  }
});

// AC2: no .gitignore at all -> file created with the entry.
test("AC2: ensureGitignore creates .gitignore with .auto-agent/ when none exists", () => {
  const dir = freshGitRepo();
  try {
    assert.ok(!existsSync(join(dir, ".gitignore")), "precondition: no .gitignore");
    ensureGitignore(dir);
    assert.ok(existsSync(join(dir, ".gitignore")), ".gitignore must be created");
    assert.ok(readFileSync(join(dir, ".gitignore"), "utf8").includes(".auto-agent/"));
    assert.ok(ignored(dir, ".auto-agent/plan.md"), "git must ignore .auto-agent/ entries");
  } finally {
    cleanup(dir);
  }
});

// AC3: non-git directory -> no .gitignore side effects.
test("AC3: ensureGitignore makes no change in a non-git directory", () => {
  const dir = plainDir();
  try {
    ensureGitignore(dir);
    assert.ok(!existsSync(join(dir, ".gitignore")), "must NOT create .gitignore outside a git repo");
  } finally {
    cleanup(dir);
  }
});

// AC4: the guarantee is wired into the run path.
test("AC4: run entrypoint (startRun) invokes ensureGitignore", () => {
  assert.ok(/ensureGitignore\(/.test(src), "source must call ensureGitignore in the run path");
  assert.ok(
    /const startRun =/.test(src) && /ensureGitignore\(/.test(src.split("const startRun =")[1]),
    "ensureGitignore must be called from startRun",
  );
});
