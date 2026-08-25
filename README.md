# auto-agent

A [Pi](https://github.com/earendil-works/pi-coding-agent) extension that runs a
disciplined **Plan → Tests → Build → Verify → Report** loop from a single command,
designed to produce high-quality output with the *minimum number of API calls*.

## Install

```bash
cp auto-agent.ts ~/.pi/agent/extensions/auto-agent.ts   # global
# or: .pi/extensions/auto-agent.ts                       # project-local
```

Then in pi: `/reload`.

## Usage

```
/auto-agent <task>        # full run (report-only; no git mutation)
/auto-agent <task> --commit  # also commit tracked changes on completion
/auto-agent-resume        # continue an interrupted run from .auto-agent/plan.md
```

Commit behavior is **opt-in**: by default the extension never touches git. Pass
`--commit` to stage *tracked* changes only (`git add -u`) and commit them on run
completion — it never runs `git add -A` and never auto-initializes a repo (if the
current directory isn't a git repo, the commit is skipped silently).

When a run completes, the extension notifies you with the **number of API calls**
made and the **total token usage** for that task (input / output / cache-read /
cache-write), taken from Pi's real per-turn usage.

## What it does

1. **Restate** — agent restates the problem + assumptions inline (no extra LLM call).
2. **Plan** — writes `.auto-agent/plan.md`: problem statement, assumptions, measurable acceptance criteria, checkbox task list, test plan.
3. **Tests first** — writes failing tests before implementation.
4. **Build** — works the task list, ticking checkboxes in plan.md as state.
5. **Verify** — runs tests; max 3 fix rounds; refuses to fake success.
6. **Report** — structured `AUTO-AGENT REPORT` (result, criteria met, tests, files, assumptions).

## Usage reporting

`/auto-agent` tracks each LLM turn (`turn_end`) as one API call and sums the
per-turn token `usage` (`input`, `output`, `cacheRead`, `cacheWrite`). On run
completion (`agent_settled`) it reports, e.g.:

```
Auto-agent complete: 7 API call(s), 48213 tokens (in 31020 / out 1720 / cache-read 15000 / cache-write 473)
```

> Token totals reflect Pi's real per-turn usage; if a provider does not return
> `usage`, the token count may read 0 while the API-call count still tracks turns.

## Why it's efficient (the four pillars)

| Pillar | How |
|---|---|
| Prompt Engineering | One structured protocol prompt: role, phases, rules. No ambiguity for the model to burn tokens resolving. |
| Context Engineering | State lives in `.auto-agent/plan.md` on disk, not chat memory; the agent re-reads the plan instead of relying on context. |
| Harness Engineering | Zero extra LLM calls — the extension injects text only; all work happens inside pi's native bash/read/edit/write tool loop. |
| Loop Engineering | Tests-first, bounded iterations (`MAX_FIX_ROUNDS = 3`), no mid-run questions, honest failure, explicit stop conditions. |

The key design decision: orchestrating each phase as a separate LLM call would cost
~6 API calls per task. Here the whole protocol costs **one user turn** plus the
unavoidable tool-call turns.

## Tuning

Edit `MAX_FIX_ROUNDS` at the top of `auto-agent.ts` to change the fix-loop budget.

## Development

```bash
npm install    # provides @earendil-works/pi-coding-agent types for editing
node --test    # static source checks (audit/feature/improve/commit-scope) + repo checks; no runtime execution
```
