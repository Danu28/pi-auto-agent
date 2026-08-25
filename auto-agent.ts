/**
 * auto-agent — a pi extension implementing a disciplined
 * Plan -> Tests -> Build -> Verify -> Report loop in ONE agent run.
 *
 * Engineering pillars:
 *  - Prompt Engineering : single structured protocol prompt (role, phases, rules).
 *  - Context Engineering: state lives in .auto-agent/plan.md on disk, not chat memory;
 *                         the agent re-reads the plan instead of relying on context.
 *  - Harness Engineering: zero extra LLM calls — everything runs inside pi's native
 *                         tool loop (bash/read/edit/write). Extension only injects text.
 *  - Loop Engineering   : tests-first, bounded fix iterations (max 3), honest failure,
 *                         no mid-run questions, explicit report format.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFileSync } from "node:child_process";

const MAX_FIX_ROUNDS = 3;

function protocol(task: string): string {
  return `# AUTO-AGENT RUN

Execute the following task using this exact protocol. Do not skip phases. Do not ask questions — record assumptions instead.

## TASK
${task}

## PHASE 1 — RESTATE (no tools, think inline)
Open your response by restating the problem in 2-4 sentences: what is built, for whom, and the **single observable signal** that proves it is done (e.g. "CLI exits 0 and prints X", "test file Y is green"). If the request is ambiguous, choose the most reasonable interpretation and say so explicitly.

## PHASE 2 — PLAN (write once, reuse forever)
Create \`.auto-agent/plan.md\` containing:
1. **Problem Statement** — your Phase-1 restatement.
2. **Assumptions** — every ambiguity you resolved.
3. **Acceptance Criteria** — numbered. Each must be verifiable from **observable output alone** (test result, CLI stdout, file content) *without* reading implementation. "Code is correct" is not a criterion. These define DONE. Nothing outside them may be built. If the requirement is already satisfied, write that in Assumptions and stop — do not invent work.
4. **Task List** — one checkbox per **one-file / one-function** change, each independently verifiable by the Test Plan command.
5. **Test Plan** — the exact command that runs the tests (e.g. \`node --test\`, \`pytest\`), and which test files prove which acceptance criteria.

## PHASE 3 — TESTS FIRST
Write **test files only** — do not edit source this phase. Author one failing test per acceptance criterion. Run the Test Plan command and **paste the failure output** into plan.md under a "Failing proof" heading. Proceed only once every new test fails for the asserted reason.

## PHASE 4 — BUILD
Work through the Task List top to bottom. **Smallest change that satisfies the criterion wins** — no extras. After completing each item:
- tick its checkbox in \`.auto-agent/plan.md\`
- run the Test Plan command; if the suite is red, fix before moving on — do not accumulate failures to "verify later"
Do not rename, restructure, or "clean up" code not touched by the current task. Do not add features not covered by acceptance criteria.

## PHASE 5 — VERIFY (the loop)
Run the full Test Plan command. A criterion counts **met only if its test is green AND \`git diff\` shows the intended behavior** — a green suite from an unrelated change is not PASS. Run \`git diff --stat\`; every changed line must map to a task or criterion. No stray debug code, no commented-out tests. Then:
- ALL PASS and diff is clean -> go to Phase 6.
- Failures or stray changes -> fix and re-run. Repeat at most ${MAX_FIX_ROUNDS} rounds; each round must change something **concrete and different** from the last — do not revert-and-retry the same edit.
- Still failing after ${MAX_FIX_ROUNDS} rounds -> STOP. Do not fake success. Report exactly what fails and why in Phase 6.
If at any point you lose track of where you are, RE-READ \`.auto-agent/plan.md\` — the file is the source of truth, not your memory of this conversation.

## PHASE 6 — REPORT
End with a report in exactly this shape:
\`\`\`
AUTO-AGENT REPORT
Result: SUCCESS | FAILED | PARTIAL
Acceptance criteria: <n>/<m> met (list any unmet ones)
Tests: <passed> passed, <failed> failed (<test command used>)
Fix rounds used: <k>/${MAX_FIX_ROUNDS}
Files changed: <git diff --stat output>
Assumptions made: <list or "none">
Next steps: <only if FAILED/PARTIAL>
\`\`\`
Result is **SUCCESS only if** every criterion's test is green, the diff maps to tasks, and no stray changes exist; otherwise FAILED or PARTIAL. Under PARTIAL, enumerate met vs unmet. Never claim a result you cannot point to evidence for.

RULES (apply everywhere):
- Zero questions. Assumptions go into plan.md.
- The plan file is state. Tick boxes as you complete tasks.
- Smallest change that satisfies acceptance criteria wins.`;
}

function resumePrompt(): string {
  return `# AUTO-AGENT RESUME

Read \`.auto-agent/plan.md\`. Find the first unchecked task and continue the protocol from there (build remaining tasks, then verify with the Test Plan command, then produce the AUTO-AGENT REPORT exactly as specified in the original protocol). Max ${MAX_FIX_ROUNDS} fix rounds. If plan.md does not exist, reply that there is nothing to resume.`;
}

function isGitRepo(dir: string): boolean {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: dir, stdio: ["ignore", "ignore", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

function buildCommitMessage(task: string): string {
  const summary = (task.split("\n").map((l) => l.trim()).find(Boolean) ?? "auto-agent task")
    .replace(/\s+/g, " ")
    .trim();
  return `auto-agent: ${summary.slice(0, 72)}`;
}

function ensureCleanCommit(task: string, dir: string = process.cwd()): void {
  if (!isGitRepo(dir)) return; // never auto-init; skip silently when not a repo
  execFileSync("git", ["add", "-u"], { cwd: dir, stdio: "ignore" }); // tracked changes only
  try {
    execFileSync("git", ["diff", "--cached", "--quiet"], { cwd: dir, stdio: "ignore" });
    return; // nothing staged -> nothing to commit
  } catch {
    // staged changes exist; proceed to commit
  }
  execFileSync("git", ["commit", "-m", buildCommitMessage(task)], { cwd: dir, stdio: "ignore" });
}

export default function (pi: ExtensionAPI) {
  let runActive = false;
  let currentTask = "";
  let commitEnabled = false;
  let runApiCalls = 0;
  let runTokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

  const startRun = (prompt: string) => {
    runActive = true;
    runApiCalls = 0;
    runTokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    // Runs never inherit state from a previous run; opt-in flags are set per run.
    commitEnabled = false;
    currentTask = "";
    pi.sendUserMessage(prompt, { deliverAs: "followUp" });
  };

  pi.on("session_shutdown", () => { runActive = false; });

  pi.registerCommand("auto-agent", {
    description: `Plan -> tests-first -> build -> verify loop (max ${MAX_FIX_ROUNDS} fix rounds; --commit auto-commits)`,
    handler: async (args, ctx) => {
      if (!args.trim()) {
        ctx.ui.notify("Usage: /auto-agent <task> [--commit]", "warning");
        return;
      }
      const task = args.trim().replace(/(^|\s)--commit(?=\s|$)/g, " ").trim();
      if (!task) {
        ctx.ui.notify("Usage: /auto-agent <task> [--commit]", "warning");
        return;
      }
      startRun(protocol(task)); // resets commitEnabled/currentTask first
      commitEnabled = /(^|\s)--commit(\s|$)/.test(args);
      currentTask = task;
    },
  });

  pi.registerCommand("auto-agent-resume", {
    description: "Continue an interrupted auto-agent run from .auto-agent/plan.md",
    handler: async () => startRun(resumePrompt()),
  });

  pi.on("turn_end", (event) => {
    if (!runActive) return;
    runApiCalls++;
    const u = event.message.usage;
    if (u) {
      runTokens.input += u.input ?? 0;
      runTokens.output += u.output ?? 0;
      runTokens.cacheRead += u.cacheRead ?? 0;
      runTokens.cacheWrite += u.cacheWrite ?? 0;
    }
  });

  pi.on("agent_settled", (_event, ctx) => {
    if (!runActive) return;
    runActive = false;
    if (commitEnabled) ensureCleanCommit(currentTask);
    const t = runTokens;
    const total = t.input + t.output + t.cacheRead + t.cacheWrite;
    ctx.ui.notify(
      `Auto-agent complete: ${runApiCalls} API call(s), ${total} tokens (summed across turns) (in ${t.input} / out ${t.output} / cache-read ${t.cacheRead} / cache-write ${t.cacheWrite})`,
      "info",
    );
  });
}
