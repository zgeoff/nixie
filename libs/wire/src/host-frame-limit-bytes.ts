// The largest frame the guest takes from the host, 64 MiB: a message's 4 images in base64, its text,
// and room to spare. The host budgets a turn's images below it, and the guest's own replies keep the
// smaller turnFrameLimitBytes.
export const hostFrameLimitBytes = 64 * 1024 * 1024;
