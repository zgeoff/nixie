import type { Log, LogTables } from '@heynixie/log';
import { readRecordKeys } from '@heynixie/log';
import type { Kysely } from 'kysely';
import type { QuoteEvidence, VersionText } from '../types';
import type { QuoteKind } from './version-quote-codec';
import { versionQuoteCodec } from './version-quote-codec';

export interface VersionQuoteSeals {
  readonly evidenceQuote: string | null;
  readonly intentQuote: string | null;
}

interface QuoteSource {
  readonly itemID: string;
  readonly version: number;
  readonly versionKey: CryptoKey;
  readonly text: VersionText;
  readonly evidence: QuoteEvidence | null;
  readonly intentEvidence: QuoteEvidence | null;
}

// Seals each quote of another record twice: the quoted record's key inside, the version's key
// outside. A quote whose record has no key is left out, with its offsets still on the version.
export async function readVersionQuoteSeals(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  db: Kysely<unknown>,
  source: QuoteSource,
): Promise<VersionQuoteSeals> {
  return {
    evidenceQuote: await sealQuote(log, db, source, 'evidence'),
    intentQuote: await sealQuote(log, db, source, 'intent'),
  };
}

async function sealQuote(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  db: Kysely<unknown>,
  source: QuoteSource,
  quote: QuoteKind,
): Promise<string | null> {
  const evidence = quote === 'evidence' ? source.evidence : source.intentEvidence;
  const text = quote === 'evidence' ? source.text.evidenceQuote : source.text.intentQuote;

  if (evidence === null || text === null) {
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
    { itemID: source.itemID, evidence },
    text,
  );

  return versionQuoteCodec.sealOuter(
    source.versionKey,
    { itemID: source.itemID, version: source.version, quote },
    inner,
  );
}
