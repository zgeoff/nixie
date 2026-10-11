import { lookup } from 'node:dns/promises';

// Resolves every A and AAAA address of a host name through the system resolver.
export async function resolveHostAddresses(host: string): Promise<readonly string[]> {
  const answers = await lookup(host, { all: true, order: 'verbatim' });

  return answers.map((answer) => answer.address);
}
