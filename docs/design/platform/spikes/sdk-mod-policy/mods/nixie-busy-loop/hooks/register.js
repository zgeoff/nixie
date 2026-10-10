// The MARK_BLOCK hook never yields, so the hooks worker stops answering.
// /nixie-alive answers only while the module is loaded, so a host can probe for it.
async function handleSessionStart($, e, next) {
  await $.command.register({
    description: 'Report that the nixie policy mod is loaded',
    immediate: true,
    name: 'nixie-alive',
  });
  return next(e);
}

function handleAliveCommand() {
  return { text: 'nixie-policy alive' };
}

function runForever() {
  while (true) {
    // Spin without awaiting.
  }
}

function checkBash($, e, next) {
  if (e.command.includes('MARK_BLOCK')) {
    runForever();
  }
  if (e.command.includes('MARK_DENY')) {
    return { deny: 'nixie-busy-loop denied this command.' };
  }
  return next(e);
}

export function register(on) {
  on('session.start', handleSessionStart);
  on('command.run', { command: 'nixie-alive' }, handleAliveCommand);
  on('tool.call', { tool: 'Bash' }, checkBash);
}
