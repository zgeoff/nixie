// A missing file prints nothing and the command still exits 0.
export const memoryKillsArgv: readonly string[] = [
  'sh',
  '-c',
  'cat /sys/fs/cgroup/memory.events 2>/dev/null; exit 0',
];
