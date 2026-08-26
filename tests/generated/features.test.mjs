import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import autoAgent from "../../auto-agent.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..", "..");
const src = readFileSync(resolve(root, "auto-agent.ts"), "utf8");
const origCwd = process.cwd();

/**
 * Mock matching test/helpers.mjs but with registerTool capture, so feature
 * tests can drive the record_criterion tool without editing helpers.mjs first.
 */
function makeExt() {
  const handlers = {};
  const commands = {};
  const tools = {};
  const sends = [];
  const notifies = [];
  autoAgent({
    on: (event, handler) => { handlers[event] = handler; },
    registerCommand: (name, opts) => { commands[name] = opts; },
    registerTool: (def) => { tools[def.name] = def; },
    sendUserMessage: (content, opts) => { sends.push({ content, opts }); },
  });
  const ctx = {
    ui: { notify: (msg, level = "info") => notifies.push({ msg, level }) },
    get cwd() { return process.cwd(); },
  };
  return { handlers, commands, tools, sends, notifies, ctx };
}

function git(dir, ...args) {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
}

function withTempRepo(fn) {
  const dir = mkdtempSync(join(tmpdir(), "aa-feat-"));
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@t.t");
  git(dir, "config", "user.name", "t");
  process.chdir(dir);
  try {
    return fn(dir);
  } finally {
    process.chdir(origCwd);
    rmSync(dir, { recursive: true, force: true });
  }
}

function runAndSettle(ext) {
  ext.commands["auto-agent"].handler("task", ext.ctx);
  ext.handlers.agent_settled({}, ext.ctx);
  return ext.notifies.find((n) => n.msg.includes("Auto-agent complete"));
}

// AC1: record_criterion tool registered + execute records + completion notify
// reports the structured count.
test("AC1: record_criterion records and completion notify reports criteria recorded: K", async () => {
  const ext = makeExt();
  assert.ok(ext.tools["record_criterion"], "record_criterion tool must be registered");
  ext.commands["auto-agent"].handler("task", ext.ctx); // start a run
  const r1 = await ext.tools["record_criterion"].execute("id", { criterion: 1, proof: "test a" });
  assert.match(r1.content[0].text, /Recorded criterion 1: test a/);
  await ext.tools["record_criterion"].execute("id", { criterion: 2, proof: "test b" });
  await ext.tools["record_criterion"].execute("id", { criterion: 3, proof: "test c" });
  ext.handlers.agent_settled({}, ext.ctx);
  const done = ext.notifies.find((n) => n.msg.includes("Auto-agent complete"));
  assert.ok(done, "completion notify emitted");
  assert.match(done.msg, /criteria recorded: 3/);
});

// AC2: coverage resets per run.
test("AC2: coverage resets each run (criteria recorded: 0 on a fresh run)", async () => {
  const ext = makeExt();
  ext.commands["auto-agent"].handler("task one", ext.ctx);
  await ext.tools["record_criterion"].execute("id", { criterion: 1, proof: "x" });
  await ext.tools["record_criterion"].execute("id", { criterion: 2, proof: "y" });
  await ext.tools["record_criterion"].execute("id", { criterion: 3, proof: "z" });
  ext.handlers.agent_settled({}, ext.ctx);
  // Second run, no record_criterion calls.
  ext.commands["auto-agent"].handler("task two", ext.ctx);
  ext.handlers.agent_settled({}, ext.ctx);
  const done = ext.notifies
    .filter((n) => n.msg.includes("Auto-agent complete"))
    .pop();
  assert.match(done.msg, /criteria recorded: 0/);
});

// AC3: /auto-agent-verify PASS for exit-0, FAIL for exit-nonzero.
test("AC3: auto-agent-verify PASS (exit 0) and FAIL (exit nonzero)", async () => {
  withTempRepo((dir) => {
    mkdirSync(join(dir, ".auto-agent"), { recursive: true });
    // Use script files (not node -e "...") so Windows cmd quoting can't turn the
    // code into a no-op string literal.
    writeFileSync(join(dir, "pass.js"), "process.exit(0);");
    writeFileSync(join(dir, "fail.js"), "process.exit(1);");
    const planOk = join(dir, ".auto-agent", "plan.md");
    writeFileSync(planOk, "## Test Plan\n\n```\nnode pass.js\n```\n");
    const ext = makeExt();
    ext.commands["auto-agent-verify"].handler("", ext.ctx);
    const ok = ext.notifies.find((n) => n.msg.includes("PASS"));
    assert.ok(ok, "exit-0 command must notify PASS");

    const planFail = join(dir, ".auto-agent", "plan.md");
    writeFileSync(planFail, "## Test Plan\n\n```\nnode fail.js\n```\n");
    const e2 = makeExt();
    e2.commands["auto-agent-verify"].handler("", e2.ctx);
    const fail = e2.notifies.find((n) => n.msg.includes("FAIL"));
    assert.ok(fail, "exit-nonzero command must notify FAIL");
  });
});

// AC4: /auto-agent-verify with no plan.md warns "no .auto-agent/plan.md".
test("AC4: auto-agent-verify warns when plan.md missing", async () => {
  withTempRepo((dir) => {
    const ext = makeExt();
    ext.commands["auto-agent-verify"].handler("", ext.ctx);
    const warn = ext.notifies.find((n) => /no \.auto-agent\/plan\.md/.test(n.msg));
    assert.ok(warn, "must warn about missing plan.md");
    assert.equal(warn.level, "warning");
  });
});

// AC5: completion notify includes files changed: N matching git diff --stat HEAD.
test("AC5: completion notify reports files changed: N matching git diff --stat HEAD", () => {
  withTempRepo((dir) => {
    writeFileSync(join(dir, "a.txt"), "a");
    git(dir, "add", "a.txt");
    git(dir, "commit", "-q", "-m", "base");
    writeFileSync(join(dir, "a.txt"), "aa");
    writeFileSync(join(dir, "b.txt"), "bb");
    git(dir, "add", "b.txt");
    git(dir, "commit", "-q", "-m", "add b");
    writeFileSync(join(dir, "a.txt"), "aaa");
    writeFileSync(join(dir, "b.txt"), "bbb");
    const expected = Number(
      git(dir, "diff", "--stat", "HEAD")
        .match(/(\d+) files? changed/)?.[1] ?? "0",
    );
    const ext = makeExt();
    const done = runAndSettle(ext);
    assert.match(done.msg, new RegExp(`files changed: ${expected}`));
  });
});

// AC6: scope-creep warning when changed-file count > DIFF_BUDGET (10).
test("AC6: scope-creep warning when changed files > DIFF_BUDGET", () => {
  withTempRepo((dir) => {
    // commit 11 tracked files, then modify all -> 11 changed vs HEAD
    for (let i = 0; i < 11; i++) {
      writeFileSync(join(dir, `f${i}.txt`), "base");
    }
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "base 11");
    for (let i = 0; i < 11; i++) {
      writeFileSync(join(dir, `f${i}.txt`), "mod");
    }
    const ext = makeExt();
    const done = runAndSettle(ext);
    assert.equal(done.level, "warning");
    assert.match(done.msg, /scope creep/);
    assert.match(done.msg, /files changed: 11/);
  });
});

// Protocol prompt engineering guard: record_criterion instruction reaches the LLM.
test("AC-prompt: protocol prompt instructs the LLM to call record_criterion", () => {
  assert.ok(/record_criterion/.test(src), "protocol must mention record_criterion");
});
