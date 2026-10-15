export interface StubResolverOptions {
  // each host's answers, in the order the stub gives them; a host with none left resolves to none
  readonly answers: Readonly<Record<string, readonly (readonly string[])[]>>;

  // how long each answer takes, as a slow DNS server's would
  readonly delayMs?: number;
}

export interface StubResolver {
  readonly resolveHost: (host: string) => Promise<readonly string[]>;

  // every host the stub was asked for, in order
  readonly hosts: readonly string[];
}

// Builds a stand-in for the DNS lookup that a page read makes: it answers each host from a script
// and records each host it was asked for.
export function buildStubResolver(options: StubResolverOptions): StubResolver {
  const hosts: string[] = [];

  const remaining = new Map(
    Object.entries(options.answers).map(([host, answers]) => [host, [...answers]]),
  );

  return {
    resolveHost: async (host) => {
      hosts.push(host);

      await Bun.sleep(options.delayMs ?? 0);

      return remaining.get(host)?.shift() ?? [];
    },
    hosts,
  };
}
