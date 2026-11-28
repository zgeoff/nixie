import { toSDKToolName } from '@heynixie/tools';

// for each tool that needs a connection, by name, the short IDs of the connections that hold its
// scopes now
export type UsableConnections = Readonly<Record<string, readonly string[]>>;

export interface ConnectionPinFacts {
  // the tools the definition lists, as the model wrote them
  readonly tools: readonly string[] | undefined;

  // the short IDs the creating call named, or undefined when it named none
  readonly named: readonly string[] | undefined;

  readonly usable: UsableConnections;
}

export type ConnectionPins =
  | { readonly status: 'pinned'; readonly pins: Readonly<Record<string, readonly string[]>> }
  | { readonly status: 'refused'; readonly unusable: readonly string[] };

// Pins each connector tool of a definition's list to the connections that hold its scopes: those the
// creating call named, or every one when it named none. A call that names a connection that no
// listed tool can use is refused, so a definition never reaches an account its creator could not.
export function buildConnectionPins(facts: ConnectionPinFacts): ConnectionPins {
  const listed = collectListedTools(facts.tools, facts.usable);

  const reachable = new Set(
    (listed.length === 0
      ? Object.values(facts.usable)
      : listed.map((tool) => facts.usable[tool])
    ).flatMap((connections) => connections ?? []),
  );

  const unusable = (facts.named ?? []).filter((connection) => !reachable.has(connection));

  if (unusable.length > 0) {
    return { status: 'refused', unusable };
  }

  return {
    status: 'pinned',
    pins: Object.fromEntries(
      listed.map((tool) => {
        const usable = facts.usable[tool] ?? [];

        return [
          tool,
          facts.named === undefined
            ? [...usable]
            : [...new Set(facts.named)].filter((connection) => usable.includes(connection)),
        ];
      }),
    ),
  };
}

function collectListedTools(
  tools: readonly string[] | undefined,
  usable: UsableConnections,
): string[] {
  const names = Object.keys(usable);

  const listed = (tools ?? []).flatMap((tool) => {
    const found = names.find((name) => name === tool || toSDKToolName(name) === tool);

    return found === undefined ? [] : [found];
  });

  return [...new Set(listed)];
}
