import { toSDKToolName } from '@heynixie/tools';

export interface ConnectionPinFacts {
  // the tools the definition lists, as the model wrote them
  readonly tools: readonly string[] | undefined;

  // the short IDs the creating call named, or undefined when it named none
  readonly named: readonly string[] | undefined;

  // the short IDs of the connections the caller may use now
  readonly usable: readonly string[];

  // the names of every tool that needs a connection
  readonly connectorTools: readonly string[];
}

export type ConnectionPins =
  | { readonly status: 'pinned'; readonly pins: Readonly<Record<string, readonly string[]>> }
  | { readonly status: 'refused'; readonly unusable: readonly string[] };

// Pins each connector tool of a definition's list to the connections the creating call named, or to
// every connection the caller may use when it named none. A call that names a connection the caller
// may not use is refused, so a definition never reaches an account its creator could not.
export function buildConnectionPins(facts: ConnectionPinFacts): ConnectionPins {
  const unusable = (facts.named ?? []).filter((connection) => !facts.usable.includes(connection));

  if (unusable.length > 0) {
    return { status: 'refused', unusable };
  }

  const pinned = facts.named === undefined ? facts.usable : [...new Set(facts.named)];

  const listed = (facts.tools ?? []).flatMap((tool) => {
    const found = facts.connectorTools.find(
      (name) => name === tool || toSDKToolName(name) === tool,
    );

    return found === undefined ? [] : [found];
  });

  return {
    status: 'pinned',
    pins: Object.fromEntries([...new Set(listed)].map((tool) => [tool, [...pinned]])),
  };
}
