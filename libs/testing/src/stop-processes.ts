// Sends SIGKILL to each process and to the process group it leads. A guest leads its own group, so
// the group's kill reaches what the guest started. A process or a group already gone is skipped.
export function stopProcesses(pids: readonly number[]): void {
  for (const pid of pids) {
    for (const target of [-pid, pid]) {
      try {
        process.kill(target, 'SIGKILL');
      } catch {
        // the process or its group is already gone
      }
    }
  }
}
