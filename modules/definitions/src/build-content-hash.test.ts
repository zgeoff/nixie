import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { buildContentHash } from './build-content-hash';

test('it gives the same hash for the same files in any order', () => {
  const persona = new TextEncoder().encode('# Persona\n');
  const rule = new TextEncoder().encode('id: rule-0\n');

  const forward = buildContentHash(
    new Map([
      ['persona.md', persona],
      ['rules/rule-0.yaml', rule],
    ]),
  );
  const backward = buildContentHash(
    new Map([
      ['rules/rule-0.yaml', rule],
      ['persona.md', persona],
    ]),
  );

  expect(forward).toBe(backward);
});

test('it hashes the version line, then each path with its length and its own hash', () => {
  const persona = new TextEncoder().encode('# Persona\n');
  const fileHash = createHash('sha256').update('# Persona\n').digest('hex');
  const listing = `nixie-definitions-v1\npersona.md\t10\t${fileHash}\n`;

  expect(buildContentHash(new Map([['persona.md', persona]]))).toBe(
    createHash('sha256').update(listing).digest('hex'),
  );
});

test('it hashes an empty snapshot as the version line alone', () => {
  const versionLine = createHash('sha256').update('nixie-definitions-v1\n').digest('hex');

  expect(buildContentHash(new Map())).toBe(versionLine);
});

test('it gives a different hash when one byte of a file changes', () => {
  const before = buildContentHash(new Map([['persona.md', new TextEncoder().encode('warm\n')]]));
  const after = buildContentHash(new Map([['persona.md', new TextEncoder().encode('worm\n')]]));

  expect(before).not.toBe(after);
});
