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

// Whether a message's whole text is a plain yes, once case, spacing and closing punctuation are set
// aside. A yes with anything more, such as "yes, but say it was 2019", is no plain yes, because the
// offered text would then save something other than what you agreed to.
export function isTypedYes(text: string): boolean {
  const words = text
    .normalize('NFC')
    .toLowerCase()
    .replaceAll(/[\s.!]+$/gu, '')
    .replaceAll(/\s+/gu, ' ')
    .trim();

  return yesAnswers.has(words);
}
