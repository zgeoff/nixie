import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { buildDefinitionsSnapshot } from './build-definitions-snapshot';

test('it builds the canonical form and its hashes', () => {
  const snapshot = buildDefinitionsSnapshot({
    persona: '# Persona\n\nWarm, brief.\n',
    policy: {
      rules: [{ id: 'slice1.read-only', outcome: 'allow', effects: ['read', 'fetch', 'note'] }],
      tools: [{ name: 'web_fetch', effects: ['fetch'], destinations: [] }],
    },
  });

  expect(snapshot).toMatchInlineSnapshot(`
    {
      "form": "{"jobs":[],"persona":"0cb77da5ed72ee52da2815cace63e7221ed3f3a3ca6bb1f8775f9e3f1b065575","policy":{"rules":[{"effects":["read","fetch","note"],"id":"slice1.read-only","outcome":"allow"}],"tools":[{"destinations":[],"effects":["fetch"],"name":"web_fetch"}]}}",
      "persona": 
    "# Persona

    Warm, brief.
    "
    ,
      "personaVersion": "0cb77da5ed72ee52da2815cace63e7221ed3f3a3ca6bb1f8775f9e3f1b065575",
      "policyHash": "cc2abb490283d7746537cbf81e684ede5c607ee8885fbf70a0c460926b9955ef",
      "snapshotHash": "d574277c39024010ddb280dadd568a2920c6c2d3cc4edf429bd987f0cda9ac60",
    }
  `);
});

test('it gives the same snapshot for the same definitions', () => {
  const input = {
    persona: '# Persona\n',
    policy: { rules: [{ id: 'slice1.read-only' }], tools: [{ name: 'web_fetch', effects: [] }] },
  };

  expect(buildDefinitionsSnapshot(input)).toStrictEqual(buildDefinitionsSnapshot(input));
});

test('it hashes the canonical form for the snapshot and the persona text for its version', () => {
  const snapshot = buildDefinitionsSnapshot({
    persona: '# Persona',
    policy: { rules: [], tools: [] },
  });
  const personaHash = createHash('sha256').update('# Persona\n').digest('hex');
  const policyHash = createHash('sha256').update('{"rules":[],"tools":[]}').digest('hex');
  const formHash = createHash('sha256').update(snapshot.form).digest('hex');

  expect(snapshot.personaVersion).toBe(personaHash);
  expect(snapshot.policyHash).toBe(policyHash);
  expect(snapshot.snapshotHash).toBe(formHash);
});

test('it gives a persona in NFD the snapshot hash of the same persona in NFC', () => {
  const policy = { rules: [], tools: [] };

  const nfd = buildDefinitionsSnapshot({ persona: 'Cafe\u0301 talk\n', policy });
  const nfc = buildDefinitionsSnapshot({ persona: 'Caf\u00E9 talk\n', policy });

  expect(nfd.snapshotHash).toBe(nfc.snapshotHash);
});

test('it gives a persona with CRLF endings the snapshot hash of the same persona with LF', () => {
  const policy = { rules: [], tools: [] };

  const crlf = buildDefinitionsSnapshot({ persona: '# Persona\r\n\r\nWarm.\r\n', policy });
  const lf = buildDefinitionsSnapshot({ persona: '# Persona\n\nWarm.\n', policy });

  expect(crlf.snapshotHash).toBe(lf.snapshotHash);
});

test('it gives a persona with no final newline or several the hash of one with one', () => {
  const policy = { rules: [], tools: [] };

  const none = buildDefinitionsSnapshot({ persona: '# Persona', policy });
  const several = buildDefinitionsSnapshot({ persona: '# Persona\n\n\n', policy });
  const one = buildDefinitionsSnapshot({ persona: '# Persona\n', policy });

  expect(none.snapshotHash).toBe(one.snapshotHash);
  expect(several.snapshotHash).toBe(one.snapshotHash);
});

test('it keeps trailing spaces, so a markdown line break changes the snapshot hash', () => {
  const policy = { rules: [], tools: [] };

  const lineBreak = buildDefinitionsSnapshot({ persona: 'Warm,  \nbrief.\n', policy });
  const plain = buildDefinitionsSnapshot({ persona: 'Warm,\nbrief.\n', policy });

  expect(lineBreak.persona).toBe('Warm,  \nbrief.\n');
  expect(lineBreak.snapshotHash).not.toBe(plain.snapshotHash);
});

test('it gives declarations with keys in any order the same snapshot hash', () => {
  const forward = buildDefinitionsSnapshot({
    persona: '# Persona\n',
    policy: {
      rules: [{ id: 'slice1.read-only', outcome: 'allow' }],
      tools: [{ name: 'web_fetch', effects: ['fetch'], execution: 'direct' }],
    },
  });
  const backward = buildDefinitionsSnapshot({
    persona: '# Persona\n',
    policy: {
      rules: [{ outcome: 'allow', id: 'slice1.read-only' }],
      tools: [{ execution: 'direct', effects: ['fetch'], name: 'web_fetch' }],
    },
  });

  expect(backward.form).toBe(forward.form);
  expect(backward.snapshotHash).toBe(forward.snapshotHash);
});

test('it sorts the rules by ID and the tools by name', () => {
  const snapshot = buildDefinitionsSnapshot({
    persona: '# Persona\n',
    policy: {
      rules: [{ id: 'test.allow-send' }, { id: 'slice1.read-only' }],
      tools: [
        { name: 'web_fetch', effects: ['fetch'] },
        { name: 'memory_note', effects: ['note'] },
      ],
    },
  });

  expect(JSON.parse(snapshot.form)).toMatchObject({
    policy: {
      rules: [{ id: 'slice1.read-only' }, { id: 'test.allow-send' }],
      tools: [{ name: 'memory_note' }, { name: 'web_fetch' }],
    },
  });
});

test('it sorts each effect list and drops its duplicates', () => {
  const messy = buildDefinitionsSnapshot({
    persona: '# Persona\n',
    policy: { rules: [], tools: [{ name: 'mail_send', effects: ['send', 'read', 'send'] }] },
  });
  const tidy = buildDefinitionsSnapshot({
    persona: '# Persona\n',
    policy: { rules: [], tools: [{ name: 'mail_send', effects: ['read', 'send'] }] },
  });

  expect(messy.snapshotHash).toBe(tidy.snapshotHash);
});

test('it changes the snapshot hash and the policy hash when a tool declaration changes', () => {
  const before = buildDefinitionsSnapshot({
    persona: '# Persona\n',
    policy: { rules: [], tools: [{ name: 'web_fetch', effects: ['fetch'] }] },
  });
  const after = buildDefinitionsSnapshot({
    persona: '# Persona\n',
    policy: { rules: [], tools: [{ name: 'web_fetch', effects: ['fetch', 'send'] }] },
  });

  expect(after.policyHash).not.toBe(before.policyHash);
  expect(after.snapshotHash).not.toBe(before.snapshotHash);
});

test('it refuses a policy with 2 rules under one ID', () => {
  expect(() =>
    buildDefinitionsSnapshot({
      persona: '# Persona\n',
      policy: { rules: [{ id: 'slice1.read-only' }, { id: 'slice1.read-only' }], tools: [] },
    }),
  ).toThrowWithMessage(Error, 'the policy holds 2 entries with id slice1.read-only');
});

test('it refuses a policy with 2 tools under one name', () => {
  expect(() =>
    buildDefinitionsSnapshot({
      persona: '# Persona\n',
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
