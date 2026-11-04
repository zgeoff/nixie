// Every task reaches the others through these two tools, so a start never leaves them out.
export const startedTaskBaseTools: readonly string[] = ['tasks.list', 'task.message'];
export const startedTaskDefaultTools: readonly string[] = [...startedTaskBaseTools, 'time.now'];
