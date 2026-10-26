import type { Log } from '@heynixie/log';
import { countBatchTokens } from './count-batch-tokens';
import type { MomentTables } from './moment-types';
import type { MomentDetail } from './read-moment-detail';
import { readMomentDetail } from './read-moment-detail';
import type { MomentRow } from './read-moment-row';
import { readMomentRow } from './read-moment-row';
import type { MomentSpanEntry } from './read-moment-span-page';
import { readMomentSpanPage } from './read-moment-span-page';

// A page goes on after the last reflection it showed, or after the last record by its sequence.
export type MomentCursor =
  | { readonly kind: 'reflection'; readonly after: string }
  | { readonly kind: 'record'; readonly after: number };

export interface MomentReadRequest {
  readonly momentID: string;
  readonly after: MomentCursor | null;
  readonly tokenCap: number;
}

type MomentReflection = MomentDetail['reflections'][number] & { readonly isCut: boolean };

export interface MomentRead {
  readonly row: MomentRow;
  readonly title: string | null;

  // the note comes on the first page only, so a later page repeats nothing but the title
  readonly isFirstPage: boolean;
  readonly note: string | null;
  readonly isNoteCut: boolean;
  readonly reflections: readonly MomentReflection[];
  readonly records: readonly MomentSpanEntry[];
  readonly next: MomentCursor | null;
}

// The keys, arrays and IDs a reader adds around the page's text, which no entry's own size holds.
const pageOverhead = 40;

export async function readMoment(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  request: MomentReadRequest,
): Promise<MomentRead | null> {
  const db = log.writer.db.$extendTables<MomentTables>();

  const row = await readMomentRow(db, request.momentID);

  if (row === null || (row.state !== 'active' && row.state !== 'retired')) {
    return null;
  }

  const detail = await readMomentDetail(log, row);

  const isFirstPage = request.after === null;
  const floor = Math.ceil(request.tokenCap / 4);
  const fullNote = isFirstPage ? detail.note : null;

  const measureHead = (note: string | null) =>
    countBatchTokens(JSON.stringify({ title: detail.title, note })) + pageOverhead;

  // A note larger than the page arrives cut, so the page keeps room for a reflection or a record.
  const note =
    fullNote === null || measureHead(fullNote) <= request.tokenCap - floor
      ? fullNote
      : cutTextToFit(fullNote, measureHead, request.tokenCap - floor);

  const head = { row, title: detail.title, isFirstPage, note, isNoteCut: note !== fullNote };

  const shown = pickReflections(detail.reflections, {
    start: await readReflectionStart(db, request.after, detail.reflections),
    used: measureHead(note),
    tokenCap: request.tokenCap,
    floor,
  });

  if (shown.next !== null) {
    return { ...head, reflections: shown.reflections, records: [], next: shown.next };
  }

  const remaining = request.tokenCap - shown.used;

  if (shown.reflections.length > 0 && remaining < floor) {
    return {
      ...head,
      reflections: shown.reflections,
      records: [],
      next: { kind: 'record', after: row.first_sequence - 1 },
    };
  }

  const page = await readMomentSpanPage(log, {
    thread: row.thread,
    firstSequence: row.first_sequence,
    lastSequence: row.last_sequence,
    after: request.after?.kind === 'record' ? request.after.after : null,
    tokenCap: Math.max(remaining, floor),
  });

  return {
    ...head,
    reflections: shown.reflections,
    records: page.entries,
    next: page.next === null ? null : { kind: 'record', after: page.next },
  };
}

// The longest start of the text whose measure, as the reader receives it, fits the cap.
function cutTextToFit(text: string, measure: (cut: string) => number, tokenCap: number): string {
  let low = 0;
  let high = text.length;

  while (low < high) {
    const middle = Math.ceil((low + high) / 2);

    if (measure(text.slice(0, middle)) <= tokenCap) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }

  return text.slice(0, low);
}

interface ReflectionBudget {
  readonly start: number;
  readonly used: number;
  readonly tokenCap: number;

  // the least a page's first reflection gets, however much the title and note used
  readonly floor: number;
}

interface PickedReflections {
  readonly reflections: readonly MomentReflection[];
  readonly used: number;
  readonly next: MomentCursor | null;
}

function pickReflections(
  reflections: MomentDetail['reflections'],
  budget: ReflectionBudget,
): PickedReflections {
  const picked: MomentReflection[] = [];
  let used = budget.used;

  for (const reflection of reflections.slice(budget.start)) {
    const entry = { ...reflection, isCut: false };
    const cost = measureReflection(entry);
    const last = picked.at(-1);

    if (used + cost > budget.tokenCap && last !== undefined) {
      return { reflections: picked, used, next: { kind: 'reflection', after: last.reflectionID } };
    }

    const fitted =
      used + cost > budget.tokenCap
        ? cutReflection(entry, Math.max(budget.tokenCap - used, budget.floor))
        : entry;

    picked.push(fitted);

    used += measureReflection(fitted);
  }

  return { reflections: picked, used, next: null };
}

const entryOverhead = 8;

function measureReflection(reflection: MomentReflection): number {
  return countBatchTokens(JSON.stringify(reflection)) + entryOverhead;
}

function cutReflection(reflection: MomentReflection, tokenCap: number): MomentReflection {
  const text = reflection.text;

  if (text === null) {
    return reflection;
  }

  const measure = (cut: string) => measureReflection({ ...reflection, text: cut, isCut: true });

  return { ...reflection, text: cutTextToFit(text, measure, tokenCap), isCut: true };
}

// A removed reflection keeps its row, so the cursor still finds its place after a removal and the
// page goes on from the next reflection in the same order.
async function readReflectionStart(
  db: Parameters<typeof readMomentRow>[0],
  after: MomentCursor | null,
  reflections: MomentDetail['reflections'],
): Promise<number> {
  if (after === null) {
    return 0;
  }

  if (after.kind === 'record') {
    return reflections.length;
  }

  const last = await db
    .selectFrom('moment_reflections')
    .select(['created_at', 'reflection_id'])
    .where('reflection_id', '=', after.after)
    .executeTakeFirst();

  if (last === undefined) {
    return 0;
  }

  const start = reflections.findIndex(
    (reflection) =>
      reflection.createdAt > last.created_at ||
      (reflection.createdAt === last.created_at && reflection.reflectionID > last.reflection_id),
  );

  return start === -1 ? reflections.length : start;
}
