import type { RenderFile } from '@heynixie/wire';
import { renderEntryPath, renderOrigin } from '@heynixie/wire';

// The file that a request's URL names, or null for a URL outside the page's own origin or a path
// that none of the files holds.
export function readPageFile(files: readonly RenderFile[], url: string): RenderFile | null {
  if (!url.startsWith(renderOrigin)) {
    return null;
  }

  const path = url.slice(renderOrigin.length).split(/[?#]/u)[0] ?? '';
  const wanted = path === '' ? renderEntryPath : decodeURIComponent(path);

  return files.find((file) => file.path === wanted) ?? null;
}
