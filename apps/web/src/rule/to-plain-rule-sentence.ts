import { parseRuleSentence } from './parse-rule-sentence';

export function toPlainRuleSentence(sentence: string): string {
  return parseRuleSentence(sentence)
    .map((part) => part.text)
    .join('');
}
