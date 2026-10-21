// A guest leads its own process group, so only a kill of the group reaches what the guest started.
export function stopProcesses(pids: readonly number[]): void {
  for (const pid of pids) {
    for (const target of [-pid, pid]) {
      try {
        process.kill(target, 'SIGKILL');
      } catch {}
    }
  }
}
