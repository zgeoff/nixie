// A hooks module imports only its own files, so the timer comes from setTimeout.
function waitMs(ms) {
  // oxlint-disable-next-line promise/avoid-new
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Holds MARK_HOLD calls for 15 s on a timer of the hook's own, then denies them.
async function handleToolCall($, e, next) {
  if (!e.command.includes('MARK_HOLD')) {
    return next(e);
  }
  await $.ui.log(`nixie hold start budget=${JSON.stringify(next.budget)}`, { to: 'debug' });
  await waitMs(15_000);
  await $.ui.log('nixie hold end', { to: 'debug' });
  return { deny: 'nixie-hold-promise: the owner refused this command.' };
}

export function register(on) {
  on('tool.call', { tool: 'Bash' }, handleToolCall);
}
