import type { GitHubOperation } from '../github-contract';

export interface GitHubRoute<Name extends string> {
  readonly name: Name;

  // each parameter of the route's path, decoded
  readonly params: Readonly<Record<string, string>>;
}

// Finds the operation whose method and path a request matches, as GitHub routes it. A `:name`
// parameter matches one segment, and a `*name` parameter the rest of the path.
export function findGitHubRoute<Name extends string>(
  operations: Readonly<Record<Name, GitHubOperation>>,
  method: string,
  pathname: string,
): GitHubRoute<Name> | null {
  for (const name in operations) {
    if (!Object.hasOwn(operations, name)) {
      continue;
    }

    const operation = operations[name];

    const match =
      operation.method === method ? buildPathPattern(operation.path).exec(pathname) : null;

    if (match !== null) {
      const params = Object.fromEntries(
        Object.entries(match.groups ?? {}).map(([param, value]) => [
          param,
          decodeURIComponent(value),
        ]),
      );

      return { name, params };
    }
  }

  return null;
}

function buildPathPattern(path: string): RegExp {
  const source = path.replaceAll(
    /(?<kind>[:*])(?<param>\w+)/gu,
    (_, kind: string, param: string) => (kind === '*' ? `(?<${param}>.+)` : `(?<${param}>[^/]+)`),
  );

  return new RegExp(`^${source}$`, 'u');
}
