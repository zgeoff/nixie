// A guest probe of a name that the guest cannot resolve fails at the lookup whatever the network
// allows, so this machine resolves the name and the guest probes each address.
export async function resolveProbeURLs(host: string, port: number): Promise<readonly string[]> {
  const entries = await Bun.dns.lookup(host);

  return [...new Set(entries.map((entry) => entry.address))].map((address) =>
    address.includes(':') ? `http://[${address}]:${port}/` : `http://${address}:${port}/`,
  );
}
