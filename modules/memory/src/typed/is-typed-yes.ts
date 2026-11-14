const yesAnswers: ReadonlySet<string> = new Set([
  'yes',
  'yes please',
  'yeah',
  'yep',
  'yup',
  'sure',
  'ok',
  'okay',
  'please do',
  'go ahead',
]);

export function isTypedYes(text: string): boolean {
  const words = text
    .normalize('NFC')
    .toLowerCase()
    .replaceAll(/[\s.!]+$/gu, '')
    .replaceAll(/\s+/gu, ' ')
    .trim();

  return yesAnswers.has(words);
}
