// Resolves a host on this machine, the trusted side, to one HTTP URL per address on the port. A
// guest probe of a name it cannot resolve fails at the lookup whatever the network allows, so a
// guest probes each address instead, which only the network layer decides.
export async function resolveProbeURLs(host: string, port: number): Promise<readonly string[]> {
  const entries = await Bun.dns.lookup(host);

  return [...new Set(entries.map((entry) => entry.address))].map((address) =>
    address.includes(':') ? `http://[${address}]:${port}/` : `http://${address}:${port}/`,
  );
}
