import type { Log } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { readItemKeys } from '../item-key/read-item-keys';
import { readRemovedSequences } from '../record/read-removed-sequences';
import type { MemoryTables, MemoryVersionRow, QuoteEvidence, VersionText } from '../types';
import { parseEvidence } from '../utils/parse-evidence';
import { decodeVersionText } from './decode-version-text';
import type { QuoteKind } from './version-quote-codec';
import { versionQuoteCodec } from './version-quote-codec';

export type VersionValueRow = Pick<
  MemoryVersionRow,
  'item_id' | 'version' | 'sequence' | 'sealed' | 'evidence' | 'intent_evidence'
>;

export type VersionValue =
  | { readonly status: 'readable'; readonly text: VersionText }
  | { readonly status: 'removed' | 'shredded' | 'unreadable' };

type Reader = Pick<Log, 'deploymentKey' | 'writer'>;

// The one reader of a version's text and quotes. A version with a key of its own holds its quotes
// in the version keyed record. A version that shares its item's key holds them inside its text,
// and the reader blanks a quote whose record a forget began on.
export async function readVersionValues(
  log: Reader,
  db: Kysely<unknown>,
  rows: readonly VersionValueRow[],
): Promise<readonly VersionValue[]> {
  const keys = await readItemKeys(
    log,
    rows.map((row) => ({
      value: 'version',
      itemID: row.item_id,
      version: row.version,
      sequence: row.sequence,
    })),
    db,
  );

  const reader = { log, db };

  const forgetting = await readRemovedSequences(db, collectQuotedSequences(rows));
  const sealedQuotes = await readSealedQuotes(db, rows);

  return Promise.all(
    rows.map(async (row, index): Promise<VersionValue> => {
      const key = keys[index];

      if (key === undefined || key.status !== 'readable') {
        return { status: key?.status ?? 'unreadable' };
      }

      try {
        const text = await decodeVersionText(
          key.key,
          { itemID: row.item_id, version: row.version },
          row.sealed,
        );

        const sealed = sealedQuotes.get(buildRowKey(row));

        if (sealed === undefined) {
          return { status: 'readable', text: blankForgottenQuotes(row, text, forgetting) };
        }

        return {
          status: 'readable',
          text: {
            text: text.text,
            evidenceQuote: await openKeyedQuote(reader, row, 'evidence', sealed),
            intentQuote: await openKeyedQuote(reader, row, 'intent', sealed),
          },
        };
      } catch {
        return { status: 'unreadable' };
      }
    }),
  );
}

function collectQuotedSequences(rows: readonly VersionValueRow[]): readonly number[] {
  return [
    ...new Set(
      rows.flatMap((row) =>
        [parseEvidence(row.evidence), parseEvidence(row.intent_evidence)].flatMap((evidence) =>
          evidence === null ? [] : [evidence.recordSequence],
        ),
      ),
    ),
  ];
}

interface SealedQuotes {
  readonly evidence: string | null;
  readonly intent: string | null;
}

async function readSealedQuotes(
  db: Kysely<unknown>,
  rows: readonly VersionValueRow[],
): Promise<ReadonlyMap<string, SealedQuotes>> {
  const itemIDs = [...new Set(rows.map((row) => row.item_id))];

  if (itemIDs.length === 0) {
    return new Map();
  }

  const keyed = await db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_item_keys')
    .select(['item_id', 'version', 'sealed_evidence_quote', 'sealed_intent_quote'])
    .where('item_id', 'in', itemIDs)
    .where('kind', '=', 'version')
    .execute();

  return new Map(
    keyed.map((row) => [
      `${row.item_id}/${String(row.version)}`,
      { evidence: row.sealed_evidence_quote, intent: row.sealed_intent_quote },
    ]),
  );
}

function buildRowKey(row: VersionValueRow): string {
  return `${row.item_id}/${String(row.version)}`;
}

function blankForgottenQuotes(
  row: VersionValueRow,
  text: VersionText,
  forgetting: ReadonlySet<number>,
): VersionText {
  return {
    text: text.text,
    evidenceQuote: isForgotten(parseEvidence(row.evidence), forgetting) ? null : text.evidenceQuote,
    intentQuote: isForgotten(parseEvidence(row.intent_evidence), forgetting)
      ? null
      : text.intentQuote,
  };
}

function isForgotten(evidence: QuoteEvidence | null, forgetting: ReadonlySet<number>): boolean {
  return evidence !== null && forgetting.has(evidence.recordSequence);
}

interface QuoteReader {
  readonly log: Reader;
  readonly db: Kysely<unknown>;
}

async function openKeyedQuote(
  reader: QuoteReader,
  row: VersionValueRow,
  quote: QuoteKind,
  sealed: SealedQuotes,
): Promise<string | null> {
  const column = quote === 'evidence' ? row.evidence : row.intent_evidence;
  const evidence = parseEvidence(column);
  const sealedQuote = sealed[quote];

  if (evidence === null || sealedQuote === null) {
    return null;
  }

  const [opened] = await readItemKeys(
    reader.log,
    [
      {
        value: 'version-quote',
        itemID: row.item_id,
        version: row.version,
        quote,
        recordSequence: evidence.recordSequence,
      },
    ],
    reader.db,
  );

  if (opened?.status !== 'readable' || opened.recordKey === undefined) {
    return null;
  }

  const ref = { itemID: row.item_id, version: row.version, quote };

  const innerSealed = await versionQuoteCodec.openOuter(opened.key, ref, sealedQuote);

  return versionQuoteCodec.openInner(
    opened.recordKey,
    { itemID: row.item_id, evidence },
    innerSealed,
  );
}
