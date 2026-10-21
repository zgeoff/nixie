// A long reply fits in 4 MiB, and the cap stops a guest from making the host buffer more.
export const turnFrameLimitBytes = 4 * 1024 * 1024;
