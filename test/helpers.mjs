import autoAgent from "../auto-agent.ts";

/**
 * Build a mock ExtensionAPI that runs the real extension with zero pi runtime.
 * Captures registered handlers/commands and every sendUserMessage / ui.notify
 * call so behavior can be asserted directly. Named `handlers` to match the
 * existing resume-commit behavioral tests.
 */
export function makeExtension() {
  const handlers = {};
  const commands = {};
  const sends = [];
  const notifies = [];
  autoAgent({
    on: (event, handler) => { handlers[event] = handler; },
    registerCommand: (name, opts) => { commands[name] = opts; },
    sendUserMessage: (content, opts) => { sends.push({ content, opts }); },
  });
  const ctx = { ui: { notify: (msg, level = "info") => notifies.push({ msg, level }) } };
  return { handlers, commands, sends, notifies, ctx };
}
