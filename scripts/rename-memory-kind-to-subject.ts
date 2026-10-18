import { Glob } from 'bun';

// Renames a memory item's kind, fact or self, to its subject, owner, self or shared, in every
// TypeScript file under the roots it takes, and leaves each record kind as it is. The commit that
// ran it gives its command line.

const replacements: readonly (readonly [RegExp, string])[] = [
  [/\bMemoryKind\b/gu, 'MemorySubject'],
  [/\bitemKind\b/gu, 'subject'],
  [/\bkind: 'fact'/gu, "subject: 'owner'"],
  [/\bkind: 'self'/gu, "subject: 'self'"],
  [/\.kind === 'self'/gu, ".subject === 'self'"],
  [/\.kind !== 'self'/gu, ".subject !== 'self'"],
  [/\.kind === 'fact'/gu, ".subject !== 'self'"],
  [/\['fact', 'self'\]/gu, "['owner', 'self', 'shared']"],
  [/\bkindSchema\b/gu, 'subjectSchema'],
];

const roots = process.argv.slice(2);

const glob = new Glob('**/*.{ts,tsx}');

let changed = 0;

for (const root of roots) {
  for await (const path of glob.scan({ cwd: root })) {
    if (path.includes('node_modules') || path.endsWith('-migration.test.ts')) {
      continue;
    }

    const file = `${root}/${path}`;

    const before = await Bun.file(file).text();

    const after = replacements.reduce(
      (text, [pattern, value]) => text.replace(pattern, value),
      before,
    );

    if (after !== before) {
      await Bun.write(file, after);

      changed += 1;
    }
  }
}

console.log(`rewrote ${String(changed)} files`);
