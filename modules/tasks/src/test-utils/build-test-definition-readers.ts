import type {
  DefinitionRunPolicy,
  DefinitionVersion,
  ReadDefinitionRunPolicy,
  ReadDefinitionVersion,
} from '../types';

export interface TestDefinitionReaders {
  readonly readDefinitionVersion: ReadDefinitionVersion;
  readonly readDefinitionRunPolicy: ReadDefinitionRunPolicy;
}

export interface TestDefinitionStore extends TestDefinitionReaders {
  // stores the version and the policy that a hash names, over the defaults for each field
  readonly add: (hash: string, entry: TestDefinitionEntry) => void;
}

interface TestDefinitionEntry {
  readonly version?: Partial<DefinitionVersion>;
  readonly policy?: Partial<DefinitionRunPolicy>;
}

// A store with no entry answers null, as the readers of a log with no definition do.
export function buildTestDefinitionStore(): TestDefinitionStore {
  const versions = new Map<string, DefinitionVersion>();
  const policies = new Map<string, DefinitionRunPolicy>();

  return {
    readDefinitionVersion: (_db, hash) => Promise.resolve(versions.get(hash) ?? null),
    readDefinitionRunPolicy: (_db, _taskID, hash) => Promise.resolve(policies.get(hash) ?? null),
    add: (hash, entry) => {
      versions.set(hash, {
        definitionID: 'water-the-tomatoes',
        name: 'Water the tomatoes',
        brief: 'Water the tomatoes in the greenhouse.',
        instructions: '',
        model: null,
        profile: null,
        persona: 'default',
        memory: 'none',
        log: 'own',
        tools: [],
        context: 'fresh',
        wakeable: false,
        trigger: null,
        ...entry.version,
      });

      policies.set(hash, {
        report: null,
        reportShape: null,
        wakeable: false,
        limits: { turns: 10, dollars: 5, calls: {} },
        ...entry.policy,
      });
    },
  };
}

export function buildTestDefinitionReaders(): TestDefinitionReaders {
  const store = buildTestDefinitionStore();

  return {
    readDefinitionVersion: store.readDefinitionVersion,
    readDefinitionRunPolicy: store.readDefinitionRunPolicy,
  };
}
