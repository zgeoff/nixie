import { lookup, resolve6 } from 'node:dns/promises';

export interface HostLookups {
  readonly readAddresses: (host: string) => Promise<readonly string[]>;
  readonly readIPv6Records: (host: string) => Promise<readonly string[]>;
}

const systemLookups: HostLookups = {
  readAddresses: async (host) => {
    const answers = await lookup(host, { all: true, order: 'verbatim' });

    return answers.map((answer) => answer.address);
  },
  readIPv6Records: resolve6,
};

const missingAddressCodes: ReadonlySet<string> = new Set(['ENOTFOUND', 'ENODATA']);

// Every address of a host. A system lookup can answer no address for a host that has only AAAA
// records, when the system has no IPv6 route, so a lookup that finds none asks for the IPv6 records
// itself. A caller can then tell a host that has only IPv6 from one that does not exist.
export async function resolveHostAddresses(
  host: string,
  lookups: HostLookups = systemLookups,
): Promise<readonly string[]> {
  try {
    return await lookups.readAddresses(host);
  } catch (error) {
    if (!(error instanceof Error) || !missingAddressCodes.has(String(Reflect.get(error, 'code')))) {
      throw error;
    }

    const records = await lookups.readIPv6Records(host).catch(() => []);

    if (records.length === 0) {
      throw error;
    }

    return records;
  }
}
