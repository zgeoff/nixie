// The largest frame the host takes from a guest, and the guest from a check request, 4 MiB: a long
// reply fits, and a guest cannot make the host buffer more. A host frame has hostFrameLimitBytes.
export const turnFrameLimitBytes = 4 * 1024 * 1024;
