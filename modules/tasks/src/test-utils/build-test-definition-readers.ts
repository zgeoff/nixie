import type {
  DefinitionRunPolicy,
  DefinitionVersion,
  ReadDefinitionNextFire,
  ReadDefinitionRunPolicy,
  ReadDefinitionVersion,
} from '../types';

export interface TestDefinitionReaders {
  readonly readDefinitionVersion: ReadDefinitionVersion;
  readonly readDefinitionRunPolicy: ReadDefinitionRunPolicy;
  readonly readDefinitionNextFire: ReadDefinitionNextFire;
}

export interface TestDefinitionStore extends TestDefinitionReaders {
  // stores the version and the policy that a hash names, over the defaults for each field
  readonly add: (hash: string, entry: TestDefinitionEntry) => void;

  // the next fire that the reader answers for a definition, over the default of null
  readonly setNextFire: (definitionID: string, nextFire: string | null) => void;
}

interface TestDefinitionEntry {
  readonly version?: Partial<DefinitionVersion>;
  readonly policy?: Partial<DefinitionRunPolicy>;
}

// A store with no entry answers null, as the readers of a log with no definition do.
export function buildTestDefinitionStore(): TestDefinitionStore {
  const versions = new Map<string, DefinitionVersion>();
  const policies = new Map<string, DefinitionRunPolicy>();
  const nextFires = new Map<string, string | null>();

  return {
    readDefinitionVersion: (_db, hash) => Promise.resolve(versions.get(hash) ?? null),
    readDefinitionRunPolicy: (_db, _taskID, hash) => Promise.resolve(policies.get(hash) ?? null),
    readDefinitionNextFire: (_db, definitionID) =>
      Promise.resolve(nextFires.get(definitionID) ?? null),
    setNextFire: (definitionID, nextFire) => {
      nextFires.set(definitionID, nextFire);
    },
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
        skills: [],
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
    readDefinitionNextFire: store.readDefinitionNextFire,
  };
}
