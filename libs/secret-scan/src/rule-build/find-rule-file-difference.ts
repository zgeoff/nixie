import { buildRuleFile } from './build-rule-file';

// Compares the committed rule file with the text the builder makes from the pinned sources, and
// describes the first line that differs. It returns null when the two are the same.
export function findRuleFileDifference(
  committedText: string,
  sourceText: string,
  licenseText: string,
): string | null {
  const expected = buildRuleFile(sourceText, licenseText);

  if (committedText === expected) {
    return null;
  }

  const committedLines = committedText.split('\n');
  const expectedLines = expected.split('\n');
  const lineCount = Math.max(committedLines.length, expectedLines.length);

  for (let index = 0; index < lineCount; index += 1) {
    if (committedLines[index] !== expectedLines[index]) {
      return `the rule file differs from the build at line ${index + 1}`;
    }
  }

  return 'the rule file differs from the build';
}
