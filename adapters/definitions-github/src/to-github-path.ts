// Fills each parameter of a GitHub route's path. A `:name` parameter is one encoded segment, and a
// `*name` parameter keeps its slashes and encodes each segment, as GitHub reads a branch or a file
// path.
export function toGitHubPath(path: string, params: Readonly<Record<string, string>>): string {
  return path.replaceAll(/(?<kind>[:*])(?<param>\w+)/gu, (_, kind: string, param: string) => {
    const value = params[param] ?? '';

    return kind === '*'
      ? value
          .split('/')
          .map((segment) => encodeURIComponent(segment))
          .join('/')
      : encodeURIComponent(value);
  });
}
