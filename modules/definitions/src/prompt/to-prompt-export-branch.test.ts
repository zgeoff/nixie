import { expect, test } from 'bun:test';
import { toPromptExportBranch } from './to-prompt-export-branch';

test('it names the export branch of a prompt after the prompt', () => {
  expect(toPromptExportBranch('content-checker')).toBe('nixie/prompt/content-checker');
});
