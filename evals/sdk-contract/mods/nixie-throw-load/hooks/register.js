// The module throws as it loads, so neither its command nor its policy ever registers.
throw new Error('nixie-throw-load: module failed at load');

export function register(on) {
  on('session.start', handleSessionStart);
  on('tool.call', handleToolCall);
}

async function handleSessionStart($, event, next) {
  await $.command.register({
    description: 'Report that the nixie policy mod is loaded',
    immediate: true,
    name: 'nixie-alive',
  });
  return next(event);
}

function handleToolCall() {
  return { deny: 'nixie-throw-load denied this command.' };
}
