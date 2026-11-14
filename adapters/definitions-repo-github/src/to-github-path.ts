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
