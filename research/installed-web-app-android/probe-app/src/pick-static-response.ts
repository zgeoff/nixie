import { extname, resolve, sep } from 'node:path';

export type StaticResponse =
  | { kind: 'icon'; variant: 'launcher' | 'badge'; size: number }
  | { kind: 'asset'; name: string }
  | { kind: 'file'; path: string; contentType: string }
  | { kind: 'not-found' };

const iconSizes = [96, 192, 512];

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

// Decides how to answer a GET outside the API: a drawn icon, a bundled script, a file from the
// public folder, or nothing.
export function pickStaticResponse(pathname: string, publicRoot: string): StaticResponse {
  const icon = /^\/icons\/(launcher|badge)-(\d+)\.png$/.exec(pathname);

  if (icon !== null) {
    const size = Number(icon[2]);

    return iconSizes.includes(size)
      ? { kind: 'icon', variant: icon[1] === 'badge' ? 'badge' : 'launcher', size }
      : { kind: 'not-found' };
  }

  if (/^\/(?:sw\.js|assets\/[\w-]+\.js)$/.test(pathname)) {
    return { kind: 'asset', name: pathname.slice(1) };
  }

  const path = resolve(publicRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
  const contentType = contentTypes[extname(path)];

  if (!path.startsWith(publicRoot + sep) || contentType === undefined) {
    return { kind: 'not-found' };
  }

  return { kind: 'file', path, contentType };
}
