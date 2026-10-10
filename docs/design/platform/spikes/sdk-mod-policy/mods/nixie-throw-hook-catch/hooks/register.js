function handleToolCall() {
  throw new Error('nixie-throw-hook-catch: hook failed');
}

function handleFailure($, e, next) {
  return {
    deny: `nixie policy failed (${next.error.kind}: ${next.error.message}), so the command did not run.`,
  };
}

export function register(on) {
  // `.catch` here is the mods API's error handler on a registration, not a promise method.
  // oxlint-disable-next-line promise/prefer-await-to-then
  on('tool.call', { tool: 'Bash' }, handleToolCall).catch(handleFailure);
}
