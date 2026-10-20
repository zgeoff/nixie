// Each marker in a Bash command picks one policy outcome, so one prompt exercises all of them.
// /nixie-alive answers only while the module is loaded, so a host can probe for it.
async function handleSessionStart($, event, next) {
  await $.command.register({
    description: 'Report that the nixie policy mod is loaded',
    immediate: true,
    name: 'nixie-alive',
  });
  return next(event);
}

function handleAliveCommand() {
  return { text: 'nixie-policy alive' };
}

function checkBash($, event, next) {
  if (event.command.includes('MARK_DENY')) {
    return { deny: 'nixie-policy denied this command.' };
  }
  if (event.command.includes('MARK_REWRITE')) {
    return next({ ...event, command: 'echo rewritten-by-nixie' });
  }
  if (event.command.includes('MARK_ANSWER_TEXT')) {
    return { result: 'answered-by-nixie as text' };
  }
  if (event.command.includes('MARK_ANSWER')) {
    // The result takes the tool's own output shape, here Bash's.
    return { result: { interrupted: false, stderr: '', stdout: 'answered-by-nixie' } };
  }
  return next(event);
}

function handleToolCall($, event, next) {
  if (event.tool !== 'Bash') {
    return next(event);
  }
  return checkBash($, event, next);
}

async function handleToolCheck($, event, next) {
  const decided = await next(event);
  if (event.tool === 'Bash' && event.input.command.includes('MARK_CHECK')) {
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
