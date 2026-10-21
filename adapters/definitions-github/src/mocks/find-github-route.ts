import type { GitHubOperation } from '../github-contract';

export interface GitHubRoute<Name extends string> {
  readonly name: Name;

  readonly params: Readonly<Record<string, string>>;
}

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
