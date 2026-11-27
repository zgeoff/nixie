// A run that names test files and none of them is the server's has no use for the test bundle.
// A run that names no file takes every test, so it needs the bundle.
export function isServerTestRun(argv: readonly string[]): boolean {
  const files = argv.filter((arg) => /\.test\.tsx?$/u.test(arg));

  return files.length === 0 || files.some((file) => file.includes('apps/server/'));
}
