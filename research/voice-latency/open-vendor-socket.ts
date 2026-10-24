// The socket a voice client talks to its vendor on. Bun's WebSocket takes request headers, which
// carry the API key, where the browser's takes only protocols.
export type OpenSocket = (url: string, headers: Record<string, string>) => WebSocket;

export const openVendorSocket: OpenSocket = (url, headers) => new WebSocket(url, { headers });
