import type { Log, LogTables } from '@heynixie/log';
import { readRecordKeys } from '@heynixie/log';
import type { Kysely } from 'kysely';
import type { MemoryVersionRow, VersionText } from '../types';
import { parseEvidence } from '../utils/parse-evidence';
import type { QuoteKind } from '../version/version-quote-codec';
import { versionQuoteCodec } from '../version/version-quote-codec';

export interface BridgeQuotes {
  readonly evidenceQuote: string | null;
  readonly intentQuote: string | null;
}

interface BridgeSource {
  readonly row: MemoryVersionRow;
  readonly text: VersionText;

  // the record a record forget removed, whose quotes the bridge drops
  readonly recordSequence: number;

  // the version number of the bridge, and the key that seals its text
  readonly version: number;
  readonly versionKey: CryptoKey;
}

// Seals each quote of another record twice: the quoted record's key inside, the bridge's version key
// outside. A quote whose record has no key is left out, with its offsets still on the version.
export async function readBridgeQuotes(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  db: Kysely<unknown>,
  source: BridgeSource,
): Promise<BridgeQuotes> {
  return {
    evidenceQuote: await sealBridgeQuote(log, db, source, 'evidence'),
    intentQuote: await sealBridgeQuote(log, db, source, 'intent'),
  };
}

async function sealBridgeQuote(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  db: Kysely<unknown>,
  source: BridgeSource,
  quote: QuoteKind,
): Promise<string | null> {
  const column = quote === 'evidence' ? source.row.evidence : source.row.intent_evidence;
  const evidence = parseEvidence(column);
  const text = quote === 'evidence' ? source.text.evidenceQuote : source.text.intentQuote;

  if (evidence === null || text === null || evidence.recordSequence === source.recordSequence) {
    return null;
  }

  const quoted = await db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('key_id')
    .where('sequence', '=', evidence.recordSequence)
    .executeTakeFirst();

  if (quoted?.key_id === null || quoted?.key_id === undefined) {
    return null;
  }

  const keys = await readRecordKeys(log, [quoted.key_id]);

  const recordKey = keys.get(quoted.key_id);

  if (recordKey === undefined || recordKey === null) {
    return null;
  }

  const inner = await versionQuoteCodec.sealInner(
    recordKey,
    { itemID: source.row.item_id, evidence },
    text,
  );

  return versionQuoteCodec.sealOuter(
    source.versionKey,
    { itemID: source.row.item_id, version: source.version, quote },
    inner,
  );
}
