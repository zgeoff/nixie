// A hooks module imports only its own files, so the timer comes from setTimeout.
function waitMs(ms) {
  // oxlint-disable-next-line promise/avoid-new
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Holds MARK_HOLD calls for 15 s on a timer of the hook's own. The .catch handler denies on failure.
async function handleToolCall($, e, next) {
  if (!e.command.includes('MARK_HOLD')) {
    return next(e);
  }
  await waitMs(15_000);
  return { deny: 'nixie-hold-promise-catch: the owner refused this command.' };
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
