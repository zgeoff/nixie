// The tools of the coding module. `coding.spawn` and `coding.stop` are actions that the runner
// queues, so no model's tool list holds them. `coding.start` is the tool that starts a coding task.
export const codingToolNames = {
  sessions: 'coding.sessions',
  steer: 'coding.steer',
  message: 'coding.message',
  read: 'coding.read',
  watch: 'coding.watch',
  start: 'coding.start',
  spawn: 'coding.spawn',
  stop: 'coding.stop',
} as const;
