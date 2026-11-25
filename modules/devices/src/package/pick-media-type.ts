const mediaTypes: Readonly<Record<string, string>> = {
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  cjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  map: 'application/json; charset=utf-8',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  svg: 'image/svg+xml',
  png: 'image/png',
  txt: 'text/plain; charset=utf-8',
  md: 'text/plain; charset=utf-8',
};

// The media type that a package file is served as, by its extension. A file of another kind is
// served as bytes that a browser never runs.
export function pickMediaType(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';

  return mediaTypes[extension] ?? 'application/octet-stream';
}
