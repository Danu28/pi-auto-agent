import { test } from "node:test";
import assert from "node:assert/strict";
import { makeExtension } from "./helpers.mjs";

const ext = makeExtension();
ext.commands["auto-agent"].handler("build app --commit", ext.ctx);

// B2 / command contract: /auto-agent queues a follow-up prompt with the flag
// stripped from the task text, and marks it deliverAs:"followUp".
test("BB1: --commit flag parsed, stripped from task, delivered as followUp", () => {
  assert.equal(ext.sends.length, 1, "exactly one kickoff prompt");
  const s = ext.sends[0];
  assert.equal(s.opts.deliverAs, "followUp", "must queue as a followUp message");
  assert.ok(s.content.includes("build app"), "stripped task must reach the prompt");
  assert.ok(!s.content.includes("--commit"), "flag must not leak into the task text");
});

// Feature AC4: the resume command also activates a run.
test("BB2: resume command queues a resume prompt as followUp", () => {
  const e = makeExtension();
  e.commands["auto-agent-resume"].handler(undefined, e.ctx);
  assert.equal(e.sends.length, 1, "resume must send one prompt");
  assert.equal(e.sends[0].opts.deliverAs, "followUp");
});

// Feature AC1/AC2 + AUDIT1: turn_end accumulates API calls and per-field token
// usage read straight off event.message.usage.
test("BB3: turn_end accumulates API-call count and token usage", () => {
  const e = makeExtension();
  e.commands["auto-agent"].handler("task", e.ctx); // activates the run
  e.handlers.turn_end({ message: { usage: { input: 100, output: 20, cacheRead: 30, cacheWrite: 5 } } }, e.ctx);
  e.handlers.turn_end({ message: { usage: { input: 50, output: 10, cacheRead: 0, cacheWrite: 0 } } }, e.ctx);
  e.handlers.agent_settled({}, e.ctx);
  const done = e.notifies.find((n) => n.msg.includes("Auto-agent complete"));
  assert.ok(done, "completion notify emitted");
  assert.ok(/2 API call/.test(done.msg), "counts 2 turns");
  assert.ok(/215 tokens/.test(done.msg), "sums 100+20+30+5+50+10+0+0 = 215");
  assert.match(done.msg, /in 150 \/ out 30 \/ cache-read 30 \/ cache-write 5/, "per-field breakdown");
});

// Feature AC3: completion notify names API calls + tokens.
test("BB4: completion notify reports API call count and tokens", () => {
  const e = makeExtension();
  e.commands["auto-agent"].handler("task", e.ctx);
  e.handlers.turn_end({ message: { usage: { input: 5, output: 3, cacheRead: 0, cacheWrite: 0 } } }, e.ctx);
  e.handlers.agent_settled({}, e.ctx);
  const done = e.notifies.find((n) => n.msg.includes("Auto-agent complete"));
  assert.ok(done && /API call/.test(done.msg) && /tokens/.test(done.msg), "completion names API calls + tokens");
  assert.ok(/summed across turns/.test(done.msg), "token label must say 'summed across turns' (IMP AC1)");
});

// B3: no misleading 'started'/'queued' notify; only the completion notify fires.
test("BB5: no 'started'/'queued' notify; completion only", () => {
  const e = makeExtension();
  e.commands["auto-agent"].handler("task", e.ctx);
  e.handlers.turn_end({ message: { usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 } } }, e.ctx);
  e.handlers.agent_settled({}, e.ctx);
  assert.ok(e.notifies.every((n) => !/started/i.test(n.msg) && !/queued/i.test(n.msg)));
  assert.ok(e.notifies.some((n) => n.msg.includes("Auto-agent complete")));
});

// README fallback: provider omitting usage yields 0 tokens, calls still count.
test("BB6: usage omitted -> 0 tokens, calls still counted", () => {
  const e = makeExtension();
  e.commands["auto-agent"].handler("task", e.ctx);
  e.handlers.turn_end({ message: {} }, e.ctx);
  e.handlers.agent_settled({}, e.ctx);
  const done = e.notifies.find((n) => n.msg.includes("Auto-agent complete"));
  assert.ok(/1 API call/.test(done.msg));
  assert.match(done.msg, /in 0 \/ out 0 \/ cache-read 0 \/ cache-write 0/, "zero token fields");
});

// session_shutdown deactivates a run: no completion notify, no counter growth.
test("BB7: session_shutdown deactivates the active run", () => {
  const e = makeExtension();
  e.commands["auto-agent"].handler("task", e.ctx);
  e.handlers.session_shutdown({}, e.ctx);
  e.handlers.turn_end({ message: { usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 } } }, e.ctx);
  e.handlers.agent_settled({}, e.ctx);
  assert.equal(e.sends.length, 1, "only the kickoff prompt");
  assert.ok(!e.notifies.some((n) => n.msg.includes("Auto-agent complete")), "no completion after shutdown");
});
