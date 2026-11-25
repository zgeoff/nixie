// The short names of the scopes the provider granted: a scope with the connector's prefix loses it,
// and an identity scope or any other scope is left out.
export function pickGrantedShortScopes(
  granted: readonly string[],
  prefix: string,
  asked: readonly string[],
): string[] {
  return granted
    .filter((scope) => scope.startsWith(prefix))
    .map((scope) => scope.slice(prefix.length))
    .filter((scope) => asked.includes(scope));
}
