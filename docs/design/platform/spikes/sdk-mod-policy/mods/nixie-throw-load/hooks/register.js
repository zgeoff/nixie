throw new Error('nixie-throw-load: module failed at load');

function handleToolCall() {
  return { deny: 'nixie-throw-load denied this command.' };
}

export function register(on) {
  on('tool.call', handleToolCall);
}
