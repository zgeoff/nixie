import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { buildDefinitionsSnapshot } from './build-definitions-snapshot';

test('it builds the canonical form and its hashes', () => {
  const snapshot = buildDefinitionsSnapshot({
    skills: [
      { name: 'tide-tables', skillHash: 'a1', origin: 'definitions' },
      { name: 'pdf-forms', skillHash: 'b2', origin: 'vendored' },
    ],
    conversationSkills: ['tide-tables'],
    persona: '# Persona\n\nWarm, brief.\n',
    prompts: {},
    policy: {
      rules: [{ id: 'allow-reads', outcome: 'allow', effects: ['read', 'fetch', 'note'] }],
      tools: [{ name: 'web_fetch', effects: ['fetch'], destinations: [] }],
    },
  });

  expect(snapshot).toMatchInlineSnapshot(`
    {
      "form": "{"conversation":{"skills":["tide-tables"]},"jobs":[],"persona":"0cb77da5ed72ee52da2815cace63e7221ed3f3a3ca6bb1f8775f9e3f1b065575","policy":{"consent":{},"contacts":[],"rules":[{"effects":["read","fetch","note"],"id":"allow-reads","outcome":"allow"}],"tools":[{"destinations":[],"effects":["fetch"],"name":"web_fetch"}]},"skills":[{"name":"pdf-forms","origin":"vendored","skillHash":"b2"},{"name":"tide-tables","origin":"definitions","skillHash":"a1"}]}",
      "persona": 
    "# Persona

    Warm, brief.
    "
    ,
      "personaVersion": "0cb77da5ed72ee52da2815cace63e7221ed3f3a3ca6bb1f8775f9e3f1b065575",
      "policyHash": "b9796c07c2f3ba58000b2aa073ef491a4321f5469944614944478d51b283a435",
      "prompts": {},
      "snapshotHash": "15628f18c4392c3ac8ff001a032b233ec054b83b2644dd4457829236e20aeba9",
    }
  `);
});

test('it gives the same snapshot for the same definitions', () => {
  const input = {
    persona: '# Persona\n',
    prompts: {},
    policy: { rules: [{ id: 'allow-reads' }], tools: [{ name: 'web_fetch', effects: [] }] },
    skills: [{ name: 'tide-tables', skillHash: 'hash-a', origin: 'definitions' as const }],
    conversationSkills: ['tide-tables'],
  };

  expect(buildDefinitionsSnapshot(input)).toStrictEqual(buildDefinitionsSnapshot(input));
});

test('it hashes the canonical form for the snapshot and the persona text for its version', () => {
  const snapshot = buildDefinitionsSnapshot({
    skills: [],
    conversationSkills: [],
    persona: '# Persona',
    prompts: {},
    policy: { rules: [], tools: [] },
  });

  const personaHash = createHash('sha256').update('# Persona\n').digest('hex');

  const policyHash = createHash('sha256')
    .update('{"consent":{},"contacts":[],"rules":[],"tools":[]}')
    .digest('hex');

  const formHash = createHash('sha256').update(snapshot.form).digest('hex');

  expect(snapshot.personaVersion).toBe(personaHash);
  expect(snapshot.policyHash).toBe(policyHash);
  expect(snapshot.snapshotHash).toBe(formHash);
});

test('it gives a persona in NFD the snapshot hash of the same persona in NFC', () => {
  const policy = { rules: [], tools: [] };

  const nfd = buildDefinitionsSnapshot({
    skills: [],
    conversationSkills: [],
    persona: 'Cafe\u0301 talk\n',
    prompts: {},
    policy,
  });

  const nfc = buildDefinitionsSnapshot({
    skills: [],
    conversationSkills: [],
    persona: 'Caf\u00E9 talk\n',
    prompts: {},
    policy,
  });

  expect(nfd.snapshotHash).toBe(nfc.snapshotHash);
});

test('it gives a persona with CRLF endings the snapshot hash of the same persona with LF', () => {
  const policy = { rules: [], tools: [] };

  const crlf = buildDefinitionsSnapshot({
    skills: [],
    conversationSkills: [],
    persona: '# Persona\r\n\r\nWarm.\r\n',
    prompts: {},
    policy,
  });

  const lf = buildDefinitionsSnapshot({
    skills: [],
    conversationSkills: [],
    persona: '# Persona\n\nWarm.\n',
    prompts: {},
    policy,
  });

  expect(crlf.snapshotHash).toBe(lf.snapshotHash);
});

test('it gives a persona with no final newline or several the hash of one with one', () => {
  const policy = { rules: [], tools: [] };

  const none = buildDefinitionsSnapshot({
    skills: [],
    conversationSkills: [],
    persona: '# Persona',
    prompts: {},
    policy,
  });

  const several = buildDefinitionsSnapshot({
    skills: [],
    conversationSkills: [],
    persona: '# Persona\n\n\n',
    prompts: {},
    policy,
  });

  const one = buildDefinitionsSnapshot({
    skills: [],
    conversationSkills: [],
    persona: '# Persona\n',
    prompts: {},
    policy,
  });

  expect(none.snapshotHash).toBe(one.snapshotHash);
  expect(several.snapshotHash).toBe(one.snapshotHash);
});

test('it keeps trailing spaces, so a markdown line break changes the snapshot hash', () => {
  const policy = { rules: [], tools: [] };

  const lineBreak = buildDefinitionsSnapshot({
    skills: [],
    conversationSkills: [],
    persona: 'Warm,  \nbrief.\n',
    prompts: {},
    policy,
  });

  const plain = buildDefinitionsSnapshot({
    skills: [],
    conversationSkills: [],
    persona: 'Warm,\nbrief.\n',
    prompts: {},
    policy,
  });

  expect(lineBreak.persona).toBe('Warm,  \nbrief.\n');
  expect(lineBreak.snapshotHash).not.toBe(plain.snapshotHash);
});

test('it gives declarations with keys in any order the same snapshot hash', () => {
  const forward = buildDefinitionsSnapshot({
    skills: [],
    conversationSkills: [],
    persona: '# Persona\n',
    prompts: {},
    policy: {
      rules: [{ id: 'allow-reads', outcome: 'allow' }],
      tools: [{ name: 'web_fetch', effects: ['fetch'], execution: 'direct' }],
    },
  });

  const backward = buildDefinitionsSnapshot({
    skills: [],
    conversationSkills: [],
    persona: '# Persona\n',
    prompts: {},
    policy: {
      rules: [{ outcome: 'allow', id: 'allow-reads' }],
      tools: [{ execution: 'direct', effects: ['fetch'], name: 'web_fetch' }],
    },
  });

  expect(backward.form).toBe(forward.form);
  expect(backward.snapshotHash).toBe(forward.snapshotHash);
});

test('it sorts the rules by ID and the tools by name', () => {
  const snapshot = buildDefinitionsSnapshot({
    skills: [],
    conversationSkills: [],
    persona: '# Persona\n',
    prompts: {},
    policy: {
      rules: [{ id: 'test.allow-send' }, { id: 'allow-reads' }],
      tools: [
        { name: 'web_fetch', effects: ['fetch'] },
        { name: 'memory_note', effects: ['note'] },
      ],
    },
  });

  expect(JSON.parse(snapshot.form)).toMatchObject({
    policy: {
      rules: [{ id: 'allow-reads' }, { id: 'test.allow-send' }],
      tools: [{ name: 'memory_note' }, { name: 'web_fetch' }],
    },
  });
});

test('it sorts each effect list and drops its duplicates', () => {
  const messy = buildDefinitionsSnapshot({
    skills: [],
    conversationSkills: [],
    persona: '# Persona\n',
    prompts: {},
    policy: { rules: [], tools: [{ name: 'mail_send', effects: ['send', 'read', 'send'] }] },
  });

  const tidy = buildDefinitionsSnapshot({
    skills: [],
    conversationSkills: [],
    persona: '# Persona\n',
    prompts: {},
    policy: { rules: [], tools: [{ name: 'mail_send', effects: ['read', 'send'] }] },
  });

  expect(messy.snapshotHash).toBe(tidy.snapshotHash);
});

test('it changes the snapshot hash and the policy hash when a tool declaration changes', () => {
  const before = buildDefinitionsSnapshot({
    skills: [],
    conversationSkills: [],
    persona: '# Persona\n',
    prompts: {},
    policy: { rules: [], tools: [{ name: 'web_fetch', effects: ['fetch'] }] },
  });

  const after = buildDefinitionsSnapshot({
    skills: [],
    conversationSkills: [],
    persona: '# Persona\n',
    prompts: {},
    policy: { rules: [], tools: [{ name: 'web_fetch', effects: ['fetch', 'send'] }] },
  });

  expect(after.policyHash).not.toBe(before.policyHash);
  expect(after.snapshotHash).not.toBe(before.snapshotHash);
});

test('it refuses a policy with 2 rules under one ID', () => {
  expect(() =>
    buildDefinitionsSnapshot({
      skills: [],
      conversationSkills: [],
      persona: '# Persona\n',
      prompts: {},
      policy: { rules: [{ id: 'allow-reads' }, { id: 'allow-reads' }], tools: [] },
    }),
  ).toThrowWithMessage(Error, 'the policy holds 2 entries with id allow-reads');
});

test('it refuses a policy with 2 tools under one name', () => {
  expect(() =>
    buildDefinitionsSnapshot({
      skills: [],
      conversationSkills: [],
      persona: '# Persona\n',
      prompts: {},
      policy: {
        rules: [],
        tools: [
          { name: 'web_fetch', effects: ['fetch'] },
          { name: 'web_fetch', effects: ['read'] },
        ],
      },
    }),
  ).toThrowWithMessage(Error, 'the policy holds 2 entries with name web_fetch');
});
