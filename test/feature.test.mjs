import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const src = readFileSync(resolve(root, "auto-agent.ts"), "utf8");

// AC1: turn_end listener increments an API-call counter while a run is active.
test("FEATURE AC1: turn_end listener registered + apiCalls counter", () => {
  assert.ok(/pi\.on\(\s*"turn_end"/.test(src), "must register pi.on('turn_end')");
  assert.ok(/runApiCalls\+\+/.test(src), "must increment runApiCalls on each turn_end");
});

// AC2: token usage accumulated from each turn's event.message.usage.
test("FEATURE AC2: token usage accumulated from message usage", () => {
  assert.ok(/\.usage\b/.test(src), "must read a .usage field in the turn_end handler");
  for (const f of ["input", "output", "cacheRead", "cacheWrite"]) {
    assert.ok(
      new RegExp("runTokens\\." + f + "\\s*\\+=").test(src),
      `must accumulate runTokens.${f}`,
    );
  }
});

// AC3: agent_settled notifies API-call count + total tokens on completion.
test("FEATURE AC3: agent_settled notifies API calls + tokens", () => {
  assert.ok(/pi\.on\(\s*"agent_settled"/.test(src), "must register pi.on('agent_settled')");
  assert.ok(/Auto-agent complete:/.test(src), "agent_settled must notify completion");
  assert.ok(/API call/.test(src), "notify must include API call count");
  assert.ok(/tokens/.test(src), "notify must include token total");
});

// AC4: both commands activate tracking (set active flag + reset counters).
test("FEATURE AC4: both commands activate tracking", () => {
  assert.ok(/runActive\s*=\s*true/.test(src), "handlers must set runActive = true");
});
