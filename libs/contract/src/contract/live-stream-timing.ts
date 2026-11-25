// The API sends a keepalive into a quiet live stream every keepAliveMs, and the web client treats a
// stream with no byte for idleLimitMs as dead, so three keepalives in a row can go missing before
// the client gives up.
export const liveStreamTiming = { keepAliveMs: 5000, idleLimitMs: 15_000 } as const;
