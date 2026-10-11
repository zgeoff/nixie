// The largest turn frame either side takes, 4 MiB: a long reply fits, and a guest cannot make the
// host buffer more.
export const turnFrameLimitBytes = 4 * 1024 * 1024;
