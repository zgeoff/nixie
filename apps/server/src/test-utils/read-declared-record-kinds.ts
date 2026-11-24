import { Glob } from 'bun';

const repoRoot = new URL('../../../../', import.meta.url).pathname;

const kindUnion = /export type \w+RecordKind\s*=\s*(?<union>[^;]*);/u;
const kindName = /'(?<kind>[^']+)'/gu;

// The record kinds that the modules and the server declare in their record-kind files. A kind that
// only a test declares is left out.
export async function readDeclaredRecordKinds(): Promise<readonly string[]> {
  const kinds = new Set<string>();
  const declarations = new Glob('{modules,apps}/*/src/**/*-record-kind.ts');

  for await (const path of declarations.scan({ cwd: repoRoot })) {
    const isTestKind = path.includes('test-record-kind');
    const source = isTestKind ? '' : await Bun.file(`${repoRoot}${path}`).text();
    const union = kindUnion.exec(source)?.groups?.['union'] ?? '';

    for (const match of union.matchAll(kindName)) {
      kinds.add(match.groups?.['kind'] ?? '');
    }
  }

  return [...kinds].filter((kind) => kind !== '');
}
