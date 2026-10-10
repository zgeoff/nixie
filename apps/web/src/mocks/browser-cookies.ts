// The browser's cookie jar for the web origin. Bun's fetch keeps no cookies, so the mock handlers
// play the browser's part: they store what a response sets and send it back on later calls. The
// preload clears the jar after each test.
export const browserCookies = new Map<string, string>();
