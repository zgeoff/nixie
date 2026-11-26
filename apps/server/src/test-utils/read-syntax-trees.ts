import invariant from 'tiny-invariant';
import type { SourceFile } from 'typescript/unstable/ast';
import { API } from 'typescript/unstable/async';

export interface SourceText {
  // a path that starts with `/`, whose extension picks the parse: `.tsx` parses JSX
  readonly path: string;
  readonly source: string;
}

// The syntax tree of each source, in the order given, parsed by the TypeScript compiler. The
// compiler reads only these sources: it loads no lib and resolves no import.
export async function readSyntaxTrees(sources: readonly SourceText[]): Promise<SourceFile[]> {
  const config = {
    compilerOptions: { jsx: 'preserve', noLib: true, noResolve: true, types: [] },
    files: sources.map((entry) => entry.path),
  };

  const files = new Map([
    ...sources.map((entry) => [entry.path, entry.source] as const),
    ['/tsconfig.json', JSON.stringify(config)],
  ]);

  // The compiler asks for each file through these 2 callbacks alone. The package's own virtual file
  // system also answers directory reads, and took over 5 s for the repo's core files.
  const api = new API({
    cwd: '/',
    fs: {
      readFile: (path) => files.get(path) ?? null,
      fileExists: (path) => files.has(path),
    },
  });

  try {
    const snapshot = await api.updateSnapshot({ openProject: '/tsconfig.json' });

    const project = snapshot.getProject('/tsconfig.json');

    invariant(project !== undefined, 'the compiler opened no project for the sources');

    return await Promise.all(
      sources.map(async (entry) => {
        const tree = await project.program.getSourceFile(entry.path);

        invariant(tree !== undefined, `the compiler parsed no tree for ${entry.path}`);

        return tree;
      }),
    );
  } finally {
    await api.close();
  }
}
