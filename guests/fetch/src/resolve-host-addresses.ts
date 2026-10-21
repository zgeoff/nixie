import { lookup } from 'node:dns/promises';

export async function resolveHostAddresses(host: string): Promise<readonly string[]> {
  const answers = await lookup(host, { all: true, order: 'verbatim' });

  return answers.map((answer) => answer.address);
}
