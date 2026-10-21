export function sendGroupSignal(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) {
      throw error;
    }
  }
}
