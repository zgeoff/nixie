// The WebSocket URL for the stream the API names. The API names an absolute ws or wss URL when the
// call carried an origin, and a bare path otherwise, which belongs on the page's own origin.
export function buildSocketURL(streamURL: string, pageURL: string): string {
  const url = new URL(streamURL, pageURL);

  url.protocol = url.protocol === 'https:' || url.protocol === 'wss:' ? 'wss:' : 'ws:';

  return url.href;
}
