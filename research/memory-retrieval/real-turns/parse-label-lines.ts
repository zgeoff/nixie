// @boundaries-ignore a spike imports the code it measures
import { parseJSONOrNull } from '../../../libs/wire/src/parse-json-or-null.ts';
import type { Label } from './score-turns.ts';
import { labelSchema } from './score-turns.ts';

export interface ParsedLabels {
  labels: Label[];
  dropped: { notLabel: number; outsideSample: number; duplicate: number; conflicting: number };
}

// Reads a rater's reply, which can hold prose between its JSON lines. It keeps each line that
// parses as a label of a sampled turn, and the first label of each turn. A later label of the same
// turn counts as a duplicate, or as conflicting when it names other references.
export function parseLabelLines(text: string, sampled: ReadonlySet<string>): ParsedLabels {
  const kept = new Map<string, Label>();
  const dropped = { notLabel: 0, outsideSample: 0, duplicate: 0, conflicting: 0 };

  for (const line of text.split('\n').map((entry) => entry.trim())) {
    if (line === '') {
      continue;
    }

    const parsed = labelSchema.safeParse(parseJSONOrNull(line));

    if (!parsed.success) {
      dropped.notLabel += 1;
    } else if (!sampled.has(parsed.data.caseID)) {
      dropped.outsideSample += 1;
    } else {
      const first = kept.get(parsed.data.caseID);

      if (first === undefined) {
        kept.set(parsed.data.caseID, parsed.data);
      } else if (isSameLabel(first, parsed.data)) {
        dropped.duplicate += 1;
      } else {
        dropped.conflicting += 1;
      }
    }
  }

  return { labels: [...kept.values()], dropped };
}

function isSameLabel(first: Label, second: Label): boolean {
  return first.best === second.best && first.relevant.toSorted().join(',') === second.relevant.toSorted().join(',');
}
