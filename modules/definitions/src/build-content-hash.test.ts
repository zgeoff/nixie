import { expect, onTestFinished, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
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

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-vendor-hash-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it matches the hash that the vendoring guide computes over a skill folder', async () => {
  const ctx = await setupTest();

  const guide = await Bun.file(
    join(import.meta.dir, '..', '..', '..', 'docs', 'guides', 'vendoring-a-skill.md'),
  ).text();

  const snippet = /```bash\n(?<script>[^`]*nixie-definitions-v1[^`]*)```/u.exec(guide)?.groups?.[
    'script'
  ];

  invariant(snippet !== undefined, 'the vendoring guide holds no hash snippet');

  await mkdir(join(ctx.dir, 'skills', 'pdf-forms', 'scripts'), { recursive: true });
  await mkdir(join(ctx.dir, 'skills', 'pdf-forms', '.git'));

  const skill = '---\nname: pdf-forms\ndescription: Fills PDF forms.\n---\n# Forms\n';
  const script = 'print("fill")\n';

  await writeFile(join(ctx.dir, 'skills', 'pdf-forms', 'SKILL.md'), skill);
  await writeFile(join(ctx.dir, 'skills', 'pdf-forms', 'scripts', 'fill.py'), script);
  await writeFile(join(ctx.dir, 'skills', 'pdf-forms', '-example.txt'), 'example\n');

  // U+FF21 sorts before U+1F600 by code point and after it by UTF-16 code unit
  await writeFile(join(ctx.dir, 'skills', 'pdf-forms', '\u{FF21}.md'), 'wide\n');
  await writeFile(join(ctx.dir, 'skills', 'pdf-forms', '\u{1F600}.md'), 'smile\n');
  await writeFile(join(ctx.dir, 'skills', 'pdf-forms', '.git', 'HEAD'), 'ref: main\n');

  const command = snippet.replaceAll(/^ {3}/gmu, '').replace('<name>', 'pdf-forms');
  const run = Bun.spawnSync(['bash', '-c', command], { cwd: ctx.dir });

  const files = new Map([
    ['SKILL.md', new TextEncoder().encode(skill)],
    ['scripts/fill.py', new TextEncoder().encode(script)],
    ['-example.txt', new TextEncoder().encode('example\n')],
    ['\u{FF21}.md', new TextEncoder().encode('wide\n')],
    ['\u{1F600}.md', new TextEncoder().encode('smile\n')],
  ]);

  expect(run.stdout.toString().trim()).toBe(buildContentHash(files));
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
