import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { sandboxGrantStartedCodec } from './sandbox-grant-started-codec';
import { sandboxGrantedCodec } from './sandbox-granted-codec';

const pageSize = 500;

// The broker secrets nixie added, by name: a started grant names one before it installs it, and a
// granted record names the one a sandbox holds, so a name from before the started record counts too.
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

      const payload =
        record.kind === sandboxGrantStartedCodec.kind
          ? sandboxGrantStartedCodec.decode(record.payload)
          : sandboxGrantedCodec.decode(record.payload);

      names.add(payload.secret);
    }

    const last = page.at(-1);

    if (last === undefined || page.length < pageSize) {
      return [...names];
    }

    afterSequence = last.record.sequence;
  }
}
