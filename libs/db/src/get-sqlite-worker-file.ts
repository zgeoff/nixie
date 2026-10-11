// The worker's file beside the module that starts it: the source in the workspace, and the
// sqlite-worker.js that the release build emits beside its bundle, because Bun's bundler does not
// follow a Worker's URL into a file of its own.
export function getSqliteWorkerFile(moduleURL: string = import.meta.url): string {
  return moduleURL.endsWith('.ts') ? 'sqlite-worker.ts' : 'sqlite-worker.js';
}
