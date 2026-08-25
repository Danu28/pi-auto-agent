import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import autoAgent from "../auto-agent.ts";

// Behavioral tests for the commit opt-in contract (audit finding F1).
// Real git, but confined to throwaway temp repos — the project repo is never touched.

const origCwd = process.cwd();

function git(dir, ...args) {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
}

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), "aa-resume-"));
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "test@test.local");
  git(dir, "config", "user.name", "test");
  writeFileSync(join(dir, "f.txt"), "v1");
  git(dir, "add", "f.txt");
  git(dir, "commit", "-q", "-m", "base");
  writeFileSync(join(dir, "f.txt"), "v2"); // tracked modification, staged by `git add -u`
  return dir;
}

function commitCount(dir) {
  return Number(git(dir, "rev-list", "--count", "HEAD"));
}

function lastMessage(dir) {
  return git(dir, "log", "-1", "--format=%s");
}

function makeExtension() {
  const handlers = {};
  const commands = {};
  autoAgent({
    on: (event, handler) => { handlers[event] = handler; },
    registerCommand: (name, opts) => { commands[name] = opts; },
    sendUserMessage: () => {},
  });
  return { handlers, commands, ctx: { ui: { notify() {} } } };
}

function withTempRepo(fn) {
  const repo = makeRepo();
  process.chdir(repo); // ensureCleanCommit runs against the temp repo
  try {
    return fn(repo);
  } finally {
    process.chdir(origCwd);
    rmSync(repo, { recursive: true, force: true });
  }
}

test("AC1: --commit run creates a commit with the task message", () => {
  withTempRepo((repo) => {
    const ext = makeExtension();
    ext.commands["auto-agent"].handler("task A --commit", ext.ctx);
    ext.handlers.agent_settled({}, ext.ctx);
    assert.equal(lastMessage(repo), "auto-agent: task A");
  });
});

test("AC3: no-flag run creates no commit", () => {
  withTempRepo((repo) => {
    const ext = makeExtension();
    ext.commands["auto-agent"].handler("plain task", ext.ctx);
    ext.handlers.agent_settled({}, ext.ctx);
    assert.equal(commitCount(repo), 1, "base commit only");
  });
});

test("AC2 (F1 regression): resume after a --commit run must NOT commit", () => {
  withTempRepo((repo) => {
    const ext = makeExtension();
    // A prior --commit run sets commitEnabled and currentTask.
    ext.commands["auto-agent"].handler("task A --commit", ext.ctx);
    ext.handlers.agent_settled({}, ext.ctx);
    assert.equal(commitCount(repo), 2, "sanity: first run committed");
    // Tempt a second commit with a fresh tracked change.
    writeFileSync(join(repo, "f.txt"), "v3");
    // Resume must not inherit commitEnabled/currentTask.
    ext.commands["auto-agent-resume"].handler(undefined, ext.ctx);
    ext.handlers.agent_settled({}, ext.ctx);
    assert.equal(commitCount(repo), 2, "resume must not commit (F1)");
  });
});
