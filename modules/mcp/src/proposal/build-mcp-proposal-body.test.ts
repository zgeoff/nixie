import { expect, test } from 'bun:test';
import { buildServerFacts } from '../test-utils/build-server-facts';
import { buildToolForm } from '../test-utils/build-tool-form';
import { buildMcpProposalBody } from './build-mcp-proposal-body';

test('it shows the client ID of a server, so a change of client alone reads as a change', () => {
  const body = buildMcpProposalBody(
    {
      change: 'server',
      serverID: 'tracker',
      facts: buildServerFacts({ clientID: 'nixie-9c1d' }),
    },
    { allowed: null, proposed: null },
  );

  expect(body.fields).toMatchObject({ clientID: 'nixie-9c1d' });
});

test('it shows both forms of an allow in full, with the effects the tool would run under', () => {
  const allowed = buildToolForm({ description: 'Read one item.' });
  const proposed = buildToolForm({ description: 'Read one item, and say who owns it.' });

  const body = buildMcpProposalBody(
    { change: 'allow', tool: 'tracker.item_get', fromHash: 'sha256:a', hash: 'sha256:b' },
    { allowed, proposed },
  );

  expect(body.fields).toStrictEqual({
    allowedForm: expect.stringContaining('"description":"Read one item."'),
    newForm: expect.stringContaining('"description":"Read one item, and say who owns it."'),
    effects: 'read',
    contentArguments: 'id',
  });
});

test('it shows the strictest effects for a tool whose form has no annotations', () => {
  const proposed = buildToolForm({ annotations: null });

  const body = buildMcpProposalBody(
    { change: 'allow', tool: 'tracker.item_get', fromHash: null, hash: 'sha256:b' },
    { allowed: null, proposed },
  );

  expect(body.fields).toMatchObject({ effects: 'write, delete, send' });
});

test('it says so when a form was forgotten, and never shows a hash in its place', () => {
  const body = buildMcpProposalBody(
    { change: 'allow', tool: 'tracker.item_get', fromHash: null, hash: 'sha256:b' },
    { allowed: null, proposed: null },
  );

  expect(body.fields).toStrictEqual({ newForm: 'the form was forgotten, so it cannot be shown' });
});
