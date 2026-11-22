import type { BodyMatch } from './collect-body-matches';
import { countJSONBytes } from './cut-body-parts';

// The most a result spends on its matches, so a long find text cannot crowd out the body.
export const matchBudgetBytes = 4000;

// Per match, the JSON around its text: the braces, the keys, the part number and the comma.
const entryOverheadBytes = 40;

// Cuts the matches to a budget: whole matches from the first on, then the first one's text
// shortened with an ellipsis when it alone passes the budget. The first match stays, because it
// names the part a read returns.
export function cutBodyMatches(
  matches: readonly BodyMatch[],
  budgetBytes: number,
): readonly BodyMatch[] {
  const kept: BodyMatch[] = [];
  let spent = 2;

  for (const match of matches) {
    const cost = countJSONBytes(match.text) + entryOverheadBytes;

    if (spent + cost > budgetBytes) {
      break;
    }

    kept.push(match);

    spent += cost;
  }

  const [first] = matches;

  if (kept.length === 0 && first !== undefined) {
    return [
      { part: first.part, text: shortenText(first.text, budgetBytes - 2 - entryOverheadBytes) },
    ];
  }

  return kept;
}

function shortenText(text: string, budgetBytes: number): string {
  let end = text.length;

  while (end > 0 && countJSONBytes(`${text.slice(0, end)}…`) > budgetBytes) {
    end = Math.floor(end / 2);
  }

  const cut = text.slice(0, end);
  const last = cut.codePointAt(cut.length - 1) ?? 0;
  const isHighSurrogate = last >= 0xd8_00 && last <= 0xdb_ff;

  return `${isHighSurrogate ? cut.slice(0, -1) : cut}…`;
}
