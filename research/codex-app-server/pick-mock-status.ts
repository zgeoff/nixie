export function pickMockStatus(path: string, failures: number): number {
  if (path.endsWith('/responses')) {
    return failures > 0 ? 401 : 200;
  }
  if (path.endsWith('/accounts/check')) {
    return 200;
  }
  return path === '/oauth/token' ? 401 : 404;
}
