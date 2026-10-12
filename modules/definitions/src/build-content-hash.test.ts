import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { buildContentHash } from './build-content-hash';

test('it hashes a snapshot of two files to its frozen value', () => {
  const hash = buildContentHash(
    new Map([
      ['persona.md', new TextEncoder().encode('# Persona\n')],
      ['rules/rule-0.yaml', new TextEncoder().encode('id: rule-0\n')],
    ]),
  );

  expect(hash).toMatchInlineSnapshot(
    `"915751679a423e22c60c69120eb40b5b78ca659889dd89c0a87669a85396bfbf"`,
  );
});

test('it gives the same hash for the same files', () => {
  const files = new Map([['persona.md', new TextEncoder().encode('# Persona\n')]]);

  expect(buildContentHash(files)).toBe(buildContentHash(files));
});

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

test('it hashes an empty snapshot to its frozen value', () => {
  expect(buildContentHash(new Map())).toMatchInlineSnapshot(
    `"86a17a94e2d0e243516b49c2570850f40fbccbc82171beccad12f364c667059e"`,
  );
});

test('it gives a different hash when one byte of a file changes', () => {
  const before = buildContentHash(new Map([['persona.md', new TextEncoder().encode('warm\n')]]));
  const after = buildContentHash(new Map([['persona.md', new TextEncoder().encode('worm\n')]]));

  expect(before).not.toBe(after);
});
