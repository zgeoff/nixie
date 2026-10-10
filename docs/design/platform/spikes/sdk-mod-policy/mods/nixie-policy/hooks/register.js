// Each marker in a Bash command picks one policy outcome, so one prompt exercises all of them.
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

async function handleToolCall($, e, next) {
  const target = e.command ?? e.file_path ?? '';
  await $.ui.log(`nixie tool.call ${e.tool} ${JSON.stringify(target)}`, { to: 'debug' });
  if (e.tool !== 'Bash') {
    return next(e);
  }
  return checkBash($, e, next);
}

async function handleToolCheck($, e, next) {
  const decided = await next(e);
  await $.ui.log(`nixie tool.check ${e.tool} upstream=${JSON.stringify(decided)}`, { to: 'debug' });
  if (e.tool === 'Bash' && e.input.command.includes('MARK_CHECK')) {
    return { decision: 'deny', reason: 'nixie-policy tool.check denied this command.' };
  }
  return decided;
}

export function register(on) {
  on('tool.call', handleToolCall);
  on('tool.check', handleToolCheck);
}
