import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { sandboxGrantStartedCodec } from './sandbox-grant-started-codec';
import { sandboxGrantedCodec } from './sandbox-granted-codec';

const pageSize = 500;

// The broker secrets nixie installed. A started record proves it. A granted record does only with a
// reference: a host-held name has none, and its sandbox host owns the secret.
export async function readGrantSecretNames(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
): Promise<readonly string[]> {
  const names = new Set<string>();

  let afterSequence = 0;

  for (;;) {
    const page = await readRecords(log, {
      afterSequence,
      limit: pageSize,
      kinds: [sandboxGrantStartedCodec.kind, sandboxGrantedCodec.kind],
    });

    for (const entry of page) {
      const record = entry.record;

      if (record.kind === sandboxGrantStartedCodec.kind) {
        names.add(sandboxGrantStartedCodec.decode(record.payload).secret);
        continue;
      }

      const granted = sandboxGrantedCodec.decode(record.payload);

      if (granted.reference !== undefined) {
        names.add(granted.secret);
      }
    }

    const last = page.at(-1);

    if (last === undefined || page.length < pageSize) {
      return [...names];
    }

    afterSequence = last.record.sequence;
  }
}
