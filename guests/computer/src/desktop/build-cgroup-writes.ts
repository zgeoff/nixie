export interface CgroupWrite {
  readonly file: string;
  readonly value: string;
}

// The limits of the terminal's cgroup. A process that goes over the memory limit ends together
// with the rest of the group, and none of it reaches swap.
export function buildCgroupWrites(memoryLimitBytes: number): readonly CgroupWrite[] {
  return [
    { file: 'memory.max', value: String(memoryLimitBytes) },
    { file: 'memory.swap.max', value: '0' },
    { file: 'memory.oom.group', value: '1' },
  ];
}
