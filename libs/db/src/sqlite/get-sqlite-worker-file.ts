// Bun's bundler does not follow a Worker's URL into a file of its own, so the release build emits
// the worker as a separate sqlite-worker.js beside the bundle.
export function getSqliteWorkerFile(moduleURL: string = import.meta.url): string {
  return moduleURL.endsWith('.ts') ? 'sqlite-worker.ts' : 'sqlite-worker.js';
}
