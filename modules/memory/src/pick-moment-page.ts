import { countBatchTokens } from './count-batch-tokens';
import type { MomentDetail } from './read-moment-detail';

// A page goes on after the last reflection it showed, or after the last record by its sequence.
export type MomentCursor =
  | { readonly kind: 'reflection'; readonly after: string }
  | { readonly kind: 'record'; readonly after: number };

export type ShownReflection = MomentDetail['reflections'][number] & { readonly isCut: boolean };

export interface MomentPageInput {
  readonly detail: MomentDetail;
  readonly after: MomentCursor | null;

  // where the reflection named in the cursor sits, or null when the cursor names none that exists
  readonly anchor: { readonly createdAt: number; readonly reflectionID: string } | null;
  readonly firstSequence: number;
  readonly tokenCap: number;
}

export interface MomentPage {
  readonly title: string | null;
  readonly isTitleCut: boolean;
  readonly isFirstPage: boolean;
  readonly note: string | null;
  readonly isNoteCut: boolean;
  readonly reflections: readonly ShownReflection[];

  // the span records the page goes on to read, or the cursor of a page that ends before them
  readonly records:
    | { readonly kind: 'read'; readonly after: number | null; readonly tokenCap: number }
    | { readonly kind: 'none'; readonly next: MomentCursor | null };
}

// The keys, arrays and IDs a reader adds around the page's text, which no entry's own size holds.
const pageOverhead = 40;

export function pickMomentPage(input: MomentPageInput): MomentPage {
  const detail = input.detail;
  const after = input.after;
  const tokenCap = input.tokenCap;
  const isFirstPage = after === null;
  const floor = Math.ceil(tokenCap / 4);
  const fullNote = isFirstPage ? detail.note : null;

  // Every page repeats the title, so a title larger than a quarter of the page arrives cut.
  const title =
    detail.title === null || measureTitle(detail.title) <= floor
      ? detail.title
      : cutTextToFit(detail.title, measureTitle, floor);

  const measureHead = (note: string | null) =>
    countBatchTokens(JSON.stringify({ title, note })) + pageOverhead;

  // A note larger than the page arrives cut, so the page keeps room for a reflection or a record.
  const note =
    fullNote === null || measureHead(fullNote) <= tokenCap - floor
      ? fullNote
      : cutTextToFit(fullNote, measureHead, tokenCap - floor);

  const head = {
    title,
    isTitleCut: title !== detail.title,
    isFirstPage,
    note,
    isNoteCut: note !== fullNote,
  };

  const shown = pickReflections(detail.reflections, {
    start: getReflectionStart(after, input.anchor, detail.reflections),
    used: measureHead(note),
    tokenCap,
    floor,
  });

  if (shown.next !== null) {
    return { ...head, reflections: shown.reflections, records: { kind: 'none', next: shown.next } };
  }

  const remaining = tokenCap - shown.used;

  if (shown.reflections.length > 0 && remaining < floor) {
    return {
      ...head,
      reflections: shown.reflections,
      records: { kind: 'none', next: { kind: 'record', after: input.firstSequence - 1 } },
    };
  }

  return {
    ...head,
    reflections: shown.reflections,
    records: {
      kind: 'read',
      after: after?.kind === 'record' ? after.after : null,
      tokenCap: Math.max(remaining, floor),
    },
  };
}

function measureTitle(title: string): number {
  return countBatchTokens(JSON.stringify({ title }));
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
  readonly reflections: readonly ShownReflection[];
  readonly used: number;
  readonly next: MomentCursor | null;
}

function pickReflections(
  reflections: MomentDetail['reflections'],
  budget: ReflectionBudget,
): PickedReflections {
  const picked: ShownReflection[] = [];
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

function measureReflection(reflection: ShownReflection): number {
  return countBatchTokens(JSON.stringify(reflection)) + entryOverhead;
}

function cutReflection(reflection: ShownReflection, tokenCap: number): ShownReflection {
  const text = reflection.text;

  if (text === null) {
    return reflection;
  }

  const measure = (cut: string) => measureReflection({ ...reflection, text: cut, isCut: true });

  return { ...reflection, text: cutTextToFit(text, measure, tokenCap), isCut: true };
}

// A removed reflection keeps its row, so the cursor still finds its place after a removal and the
// page goes on from the next reflection in the same order.
function getReflectionStart(
  after: MomentCursor | null,
  anchor: MomentPageInput['anchor'],
  reflections: MomentDetail['reflections'],
): number {
  if (after === null) {
    return 0;
  }

  if (after.kind === 'record') {
    return reflections.length;
  }

  if (anchor === null) {
    return 0;
  }

  const start = reflections.findIndex(
    (reflection) =>
      reflection.createdAt > anchor.createdAt ||
      (reflection.createdAt === anchor.createdAt && reflection.reflectionID > anchor.reflectionID),
  );

  return start === -1 ? reflections.length : start;
}
