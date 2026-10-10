// A stop sends SIGTERM, then kills the process's whole cgroup this long after, so no descendant
// outlives it.
export const stopGraceMs = 5000;
