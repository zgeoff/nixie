import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeStepValues } from './write-step-values.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-step-values-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  return { outputPath: join(directory, 'output') };
}

test('it appends one line for each value after the lines already there', () => {
  const ctx = setupTest();

  writeFileSync(ctx.outputPath, 'tag=v1.4.0\n');
  writeStepValues(ctx.outputPath, { version: '1.4.0', sha: 'a1b2c3' });

  expect(readFileSync(ctx.outputPath, 'utf8')).toBe('tag=v1.4.0\nversion=1.4.0\nsha=a1b2c3\n');
});

test('it writes an empty value as the bare name and equals sign', () => {
  const ctx = setupTest();

  writeFileSync(ctx.outputPath, '');
  writeStepValues(ctx.outputPath, { tag: '' });

  expect(readFileSync(ctx.outputPath, 'utf8')).toBe('tag=\n');
});
