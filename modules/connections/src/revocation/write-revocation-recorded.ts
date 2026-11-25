import type { RevokeResult } from '@heynixie/credentials';
import type { Definitions, Log } from '@heynixie/log';
import { writeRecords } from '@heynixie/log';
import { revocationRecordedCodec } from '../record/revocation-recorded-codec';

export interface RevocationWriter {
  readonly log: Log;
  readonly definitions: () => Definitions;
}

export async function writeRevocationRecorded(
  writer: RevocationWriter,
  connectionID: string,
  result: RevokeResult,
): Promise<void> {
  await writeRecords(writer.log, [
    {
      kind: revocationRecordedCodec.kind,
      definitions: writer.definitions(),
      payload: revocationRecordedCodec.encode({
        connection: connectionID,
        outcome: result.outcome,
        status: result.status,
        googleError: result.providerError,
      }),
    },
  ]);
}
