// Fills each {{ slot }} of a sentence with its value in one pass, so a value that holds braces stays
// literal.
export function fillStatusText(template: string, values: Readonly<Record<string, string>>): string {
  return template.replaceAll(
    /\{\{ (?<slot>[a-zA-Z]+) \}\}/gu,
    (match: string, slot: string) => values[slot] ?? match,
  );
}
