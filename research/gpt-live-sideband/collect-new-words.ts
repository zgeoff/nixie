// Lists the words GPT-Live said that appear nowhere in the text nixie sent, once each, with number
// words read as digits. A new word flags a possible invented fact; a person still reads each one,
// because a paraphrase adds words such as "you've" or "got".
import { numberWords } from './number-words.ts';

export function collectNewWords(sentText: string, spokenText: string): string[] {
  const sent = new Set(collectNormalWords(sentText));
  return [...new Set(collectNormalWords(spokenText))].filter((word) => !sent.has(word));
}

function collectNormalWords(text: string): string[] {
  return [...text.matchAll(/[\p{L}\p{N}'’]+/gu)].map((found) => {
    const lower = found[0].toLowerCase().replaceAll('’', "'");
    return numberWords[lower] ?? lower;
  });
}
