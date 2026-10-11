// The waits between the 5 attempts of an action: 30 s, 2 min, 8 min and 30 min. Why: the schedule
// rides out a rate limit or a short outage within about 40 min, and an action still failing after
// that needs you more than another attempt.
export const defaultRetryDelaysMs: readonly number[] = [30_000, 120_000, 480_000, 1_800_000];
