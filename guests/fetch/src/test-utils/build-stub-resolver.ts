export interface StubResolverOptions {
  readonly answers: Readonly<Record<string, readonly (readonly string[])[]>>;

  readonly delayMs?: number;
}

export interface StubResolver {
  readonly resolveHost: (host: string) => Promise<readonly string[]>;

  readonly hosts: readonly string[];
}

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
