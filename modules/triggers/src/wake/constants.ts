// The shortest and the longest time that a wake rule's expiry or window takes, which every rule
// obeys whoever sets it: a tool call or the deployment config. The longest keeps the expiry date a
// date, and the duration a safe integer.
export const minWakeDurationMs = 60_000;
export const maxWakeDurationMs = 3650 * 86_400_000;
