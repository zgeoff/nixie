// How long the user's speech, or the speech layer's own, stays quiet before the adapter closes the
// line it has collected.
export const quietMs = 1000;

// How long a cut waits for the output transcript of the words spoken up to it, which arrives a
// little behind the user's speech.
export const cutSettleMs = 500;

// The provider's session lasts 2 hours when it reports no expiry.
export const sessionLimitMs = 2 * 60 * 60 * 1000;

// The warning comes this long before the session's expiry.
export const sessionWarningMs = 5 * 60 * 1000;

// How long a close waits for the speech layer to finish a line.
export const closeIdleLimitMs = 120_000;

// How long a close waits for the provider to confirm.
export const closeConfirmMs = 5000;

// How long the adapter waits between looks at a speech session that a close waits on.
export const closePollMs = 200;

// The acknowledgement delay at its maximum, which holds back the speech layer's own
// acknowledgement of a hand-off.
export const acknowledgementDelayMs = 800;

// The provider takes at most 500 tokens in one commentary. A part stays inside 400 estimated tokens,
// and the estimate is the text's UTF-8 byte count, which no text goes past in real tokens.
export const maxPartTokens = 400;

// How long the sideband may take to open before the open fails.
export const sidebandOpenLimitMs = 15_000;
