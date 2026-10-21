// Bun's fetch keeps no cookies, so the mock handlers store what a response sets and send it back
// on later calls, as a browser does.
export const browserCookies = new Map<string, string>();
