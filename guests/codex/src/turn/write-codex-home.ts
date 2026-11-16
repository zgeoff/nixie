import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CodexConfigInput } from '../config/build-codex-config';
import { buildCodexConfig } from '../config/build-codex-config';
import { buildModelCatalog } from '../config/build-model-catalog';
import { getCodexHome } from './get-codex-home';
import { getWorkDir } from './get-work-dir';
import { writeEmptyGitRepo } from './write-empty-git-repo';

export type CodexHomeInput = Omit<CodexConfigInput, 'catalogPath'>;

// Writes the config and the model catalog that the CLI starts from, and the working directory with
// an empty git repository of its own.
export async function writeCodexHome(home: string, input: CodexHomeInput): Promise<void> {
  const codexHome = getCodexHome(home);
  const catalogPath = join(codexHome, 'model-catalog.json');

  await mkdir(codexHome, { recursive: true });
  await mkdir(getWorkDir(home), { recursive: true });
  await writeFile(catalogPath, JSON.stringify(buildModelCatalog(input.model)));
  await writeFile(join(codexHome, 'config.toml'), buildCodexConfig({ ...input, catalogPath }));
  await writeEmptyGitRepo(getWorkDir(home));
}
