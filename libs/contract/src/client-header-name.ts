// The custom header every call from a client carries. A cross-site form cannot send it, so the API
// refuses a call without it.
export const clientHeaderName = 'x-nixie-client';
