function handleToolCall() {
  throw new Error('nixie-throw-hook: hook failed');
}

export function register(on) {
  on('tool.call', { tool: 'Bash' }, handleToolCall);
}
