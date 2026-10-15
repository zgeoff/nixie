// Each marker in a Bash command picks one policy outcome, so one prompt exercises all of them.
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

function checkBash($, e, next) {
  if (e.command.includes('MARK_DENY')) {
    return { deny: 'nixie-policy denied this command.' };
  }
  if (e.command.includes('MARK_REWRITE')) {
    return next({ ...e, command: 'echo rewritten-by-nixie' });
  }
  if (e.command.includes('MARK_ANSWER_TEXT')) {
    return { result: 'answered-by-nixie as text' };
  }
  if (e.command.includes('MARK_ANSWER')) {
    // The result takes the tool's own output shape, here Bash's.
    return { result: { interrupted: false, stderr: '', stdout: 'answered-by-nixie' } };
  }
  return next(e);
}

function handleToolCall($, e, next) {
  if (e.tool !== 'Bash') {
    return next(e);
  }
  return checkBash($, e, next);
}

async function handleToolCheck($, e, next) {
  const decided = await next(e);
  if (e.tool === 'Bash' && e.input.command.includes('MARK_CHECK')) {
    return { decision: 'deny', reason: 'nixie-policy tool.check denied this command.' };
  }
  return decided;
}

export function register(on) {
  on('session.start', handleSessionStart);
  on('command.run', { command: 'nixie-alive' }, handleAliveCommand);
  on('tool.call', handleToolCall);
  on('tool.check', handleToolCheck);
}
