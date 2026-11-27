import type { ConnectorContext } from '@heynixie/connections';
import { z } from 'zod';
import type { GoogleHosts } from '../types';
import { callGmail } from './call-gmail';

export type LabelIndex =
  | { readonly kind: 'labels'; readonly idByName: ReadonlyMap<string, string> }
  | { readonly kind: 'failed'; readonly reason: string; readonly status: number };

const systemLabels = ['INBOX', 'UNREAD', 'STARRED', 'IMPORTANT'];
const labelSchema = z.object({ id: z.string(), name: z.string() });
const listSchema = z.object({ labels: z.array(labelSchema).exactOptional() });

// The label ID of each name in the account: the system labels that gmail.label takes, and every
// user label.
export async function readLabelIndex(
  hosts: GoogleHosts,
  context: ConnectorContext,
): Promise<LabelIndex> {
  const reply = await callGmail(hosts, context, { path: '/labels' });

  if (reply.kind === 'error') {
    return { kind: 'failed', reason: reply.reason, status: reply.status };
  }

  const listed = listSchema.safeParse(reply.body);

  if (!listed.success) {
    return { kind: 'failed', reason: 'Gmail answered with no list of labels', status: 502 };
  }

  const idByName = new Map<string, string>(systemLabels.map((name) => [name, name]));

  for (const label of listed.data.labels ?? []) {
    if (!systemLabels.includes(label.name.toUpperCase())) {
      idByName.set(label.name, label.id);
    }
  }

  return { kind: 'labels', idByName };
}

export function isSystemLabel(name: string): boolean {
  return systemLabels.includes(name);
}
