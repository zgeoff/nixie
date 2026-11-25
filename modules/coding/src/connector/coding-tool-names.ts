// The tools of the coding module. `coding.start` and `coding.stop` are actions that the runner
// queues, so no model's tool list holds them.
export const codingToolNames = {
  sessions: 'coding.sessions',
  steer: 'coding.steer',
  message: 'coding.message',
  read: 'coding.read',
  watch: 'coding.watch',
  start: 'coding.start',
  stop: 'coding.stop',
} as const;
