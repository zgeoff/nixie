import type { Writer } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import { writeTaskVersions } from '../task/write-task-versions';
import { buildSHA256 } from '../utils/build-sha256';

export interface TaskVersionSeed {
  readonly definitionID: string;
  readonly name: string;
  readonly brief: string;
  readonly memory?: 'none' | 'read' | 'self_notes';

  // stored as given, as the parser stored a list before it mapped SDK names and added the base tools
  readonly tools?: readonly string[];
}

// Stores one version of each task definition, as a seed stores the versions it parses, in one write
// transaction, so a test can seed many fast. The form holds the defaults a task.yaml with only a
// name and a brief parses to. Returns each definition with the hash of its version.
export async function seedTaskVersions(
  writer: Writer,
  seeds: readonly TaskVersionSeed[],
): Promise<readonly { readonly definitionID: string; readonly definitionHash: string }[]> {
  const definitions = seeds.map((seed) => ({
    id: seed.definitionID,
    hash: buildSHA256(
      [seed.definitionID, seed.name, seed.brief, seed.memory ?? '', ...(seed.tools ?? [])].join(
        '\n',
      ),
    ),
    form: {
      name: seed.name,
      brief: seed.brief,
      enabled: true,
      context: 'fresh',
      wakeable: false,
      ...(seed.memory === undefined ? {} : { memory: seed.memory }),
      ...(seed.tools === undefined ? {} : { tools: [...seed.tools] }),
    },
    files: {},
  }));

  await withWriteTransaction(writer, (tx) => writeTaskVersions(tx, definitions));

  return definitions.map((definition) => ({
    definitionID: definition.id,
    definitionHash: definition.hash,
  }));
}
