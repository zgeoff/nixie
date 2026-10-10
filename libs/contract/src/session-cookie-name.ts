// The cookie that holds a browser's device session. The API sets it from its enrolment response,
// host-only and HttpOnly with Path=/, so it reaches the API and the web server on their one host
// name, and no client script reads or sets it.
export const sessionCookieName = 'nixie_session';
