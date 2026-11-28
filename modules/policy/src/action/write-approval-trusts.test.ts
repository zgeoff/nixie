import { expect, test } from 'bun:test';
import type { JSONObject } from '@heynixie/log';
import { withWriteTransaction, writeRecords } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import type { ProposalAnswerInput } from '@heynixie/proposals';
import { buildMockSharedProposal } from '@heynixie/proposals/test-utils';
import invariant from 'tiny-invariant';
import { placesProjection } from '../place/places-projection';
import { readPlaces } from '../place/read-places';
import type { PlaceKey } from '../place/types';
import { writePlaceAdded } from '../place/write-place-added';
import type { AskCause } from '../types';
import { buildActionHash } from './build-action-hash';
import { buildActionProposalInput } from './build-action-proposal-input';
import { makeActionProposalHandler } from './make-action-proposal-handler';

interface HeldCall {
  readonly tool: string;
  readonly cause?: AskCause;
  readonly input: JSONObject;
  readonly destinations: readonly string[];
  readonly effects?: readonly ('fetch' | 'send' | 'policy_widen')[];
}

async function setupTest() {
  const started = await startTestLog();

  const log = { ...started.log, projections: [...started.log.projections, placesProjection] };
  const queued: string[] = [];

  const placeContext = {
    log,
    definitions: () => ({ snapshotHash: 'snapshot-1' }),
    runInForce: () => Promise.resolve(),
  };

  const handler = makeActionProposalHandler({
    log,
    definitions: () => ({ snapshotHash: 'snapshot-1' }),
    readPlaces: () => placeContext,
    writeThreadRecord: () => Promise.resolve(),
    writeRule: () => Promise.resolve(),
    queueApproved: (_tx, approved) => {
      queued.push(approved.tool);

      return Promise.resolve('action-1');
    },
    readHeldAction: () => Promise.resolve(null),
    failHeld: () => Promise.resolve(),
    runAfterRule: () => Promise.resolve(),
    writeSuggestedRuleDecline: () => Promise.resolve(),
    runSuggestedRuleCheck: () => Promise.resolve(),
  });

  return {
    log,
    placeContext,
    queued,
    site: { kind: 'site', domain: 'tickets.example.com', subdomains: false } satisfies PlaceKey,
    proposal: {
      places: [
        { place: 'tickets.example.com', trust: 'act', why: 'You book here every week.' },
        { place: '*.library.example.org', trust: 'read', why: 'Your library splits its catalog.' },
      ],
    },
    addPlace: (key: PlaceKey, trust: 'blocked' | 'known' | 'read' | 'act') =>
      writePlaceAdded(placeContext, { key, trust, name: null, addedBy: 'you' }),
    hold: async (call: HeldCall) => {
      const destinations = call.destinations.map((value) => ({ value, replyTarget: false }));

      const actionHash = buildActionHash({
        tool: call.tool,
        input: call.input,
        destinations: [...call.destinations],
      });

      const proposed = buildActionProposalInput({
        definitions: { snapshotHash: 'snapshot-1' },
        thread: 'conversation',
        callSequence: 1,
        tool: call.tool,
        actionHash,
        effects: call.effects ?? ['fetch'],
        cause: call.cause ?? 'outside_steering',
        input: call.input,
        destinations,
      });

      const [written] = await writeRecords(log, [proposed.record]);

      const row = buildMockSharedProposal({
        id: proposed.proposalID,
        thread: 'conversation',
        createdSequence: written?.sequence ?? 0,
        actionHash,
      });

      return {
        row,
        readBody: async () => {
          const bodies = await handler.readBodies(log.writer.db, [row]);

          return bodies.get(row.id);
        },
        readHashes: () => handler.readHashes(log.writer.db, row),
        approve: (answer: Partial<ProposalAnswerInput>) =>
          withWriteTransaction(log.writer, (tx) =>
            handler.approve(
              { tx, guard: () => Promise.resolve(), settle: () => Promise.resolve() },
              row,
              {
                proposalID: row.id,
                actionHash,
                choice: 'approve',
                identityID: 'identity-1',
                ...answer,
              },
            ),
          ),
      };
    },
  };
}

test('it offers to trust the one place that every destination of a held call names', async () => {
  const ctx = await setupTest();

  const held = await ctx.hold({
    tool: 'web_fetch',
    input: { url: 'https://tickets.example.com/open' },
    destinations: ['https://tickets.example.com/open', 'tickets.example.com'],
  });

  const body = await held.readBody();
  const hashes = await held.readHashes();

  invariant(body?.place, 'the card offers the place');

  expect({ place: body.place, hashes: hashes.place }).toStrictEqual({
    place: {
      words: 'tickets.example.com',
      readHash: expect.toBeString(),
      actHash: expect.toBeString(),
    },
    hashes: { read: body.place.readHash, act: body.place.actHash },
  });
});

test('it offers no place for a call whose destinations are in two places', async () => {
  const ctx = await setupTest();

  const held = await ctx.hold({
    tool: 'web_fetch',
    input: {},
    destinations: ['tickets.example.com', 'news.example.net'],
  });

  const hashes = await held.readHashes();

  expect(hashes.place).toBeNull();
});

test('it offers no place for an ask that a rule made', async () => {
  const ctx = await setupTest();

  const held = await ctx.hold({
    tool: 'web_fetch',
    cause: 'ask_rule',
    input: {},
    destinations: ['tickets.example.com'],
  });

  const hashes = await held.readHashes();

  expect(hashes.place).toBeNull();
});

test('it adds the place at the level of the answer, queues the call and writes no rule', async () => {
  const ctx = await setupTest();

  const held = await ctx.hold({
    tool: 'web_fetch',
    input: { url: 'https://tickets.example.com/open' },
    destinations: ['tickets.example.com'],
  });

  const hashes = await held.readHashes();
  const outcome = await held.approve({ trust: 'read', placeHash: hashes.place?.read });
  const places = await readPlaces(ctx.log);

  expect({
    outcome: outcome.status === 'done' ? outcome.result : outcome,
    queued: ctx.queued,
    listed: places.map((place) => [place.key, place.trust, place.addedBy]),
  }).toStrictEqual({
    outcome: { proposalID: held.row.id, state: 'approved' },
    queued: ['web_fetch'],
    listed: [[ctx.site, 'read', 'card']],
  });
});

test('it raises an entry that the place already holds', async () => {
  const ctx = await setupTest();

  await ctx.addPlace(ctx.site, 'read');

  const held = await ctx.hold({
    tool: 'computer.screen_click',
    input: { x: 1, y: 2 },
    destinations: ['tickets.example.com'],
    effects: ['send'],
  });

  await held.approve({ trust: 'act' });

  const places = await readPlaces(ctx.log);

  expect(places.map((place) => place.trust)).toStrictEqual(['act']);
});

test('it refuses a trust answer for a place that is blocked now, and queues nothing', async () => {
  const ctx = await setupTest();

  const held = await ctx.hold({
    tool: 'web_fetch',
    input: {},
    destinations: ['tickets.example.com'],
  });

  await ctx.addPlace(ctx.site, 'blocked');

  const outcome = await held.approve({ trust: 'read' });

  expect({ outcome, queued: ctx.queued }).toStrictEqual({
    outcome: { status: 'refused', refusal: { error: 'NOT_ALLOWED', reason: 'place_blocked' } },
    queued: [],
  });
});

test('it refuses a trust answer for a call that carried no offer', async () => {
  const ctx = await setupTest();

  const held = await ctx.hold({
    tool: 'web_fetch',
    input: {},
    destinations: ['tickets.example.com', 'news.example.net'],
  });

  const outcome = await held.approve({ trust: 'read' });

  expect(outcome).toStrictEqual({
    status: 'refused',
    refusal: { error: 'NOT_ALLOWED', reason: 'no_place_offer' },
  });
});

test('it lists each proposed place in words with its level and reason, with no place offer', async () => {
  const ctx = await setupTest();

  const held = await ctx.hold({
    tool: 'places.propose',
    cause: 'always_ask',
    input: ctx.proposal,
    destinations: [],
    effects: ['policy_widen'],
  });

  const body = await held.readBody();

  expect({ places: body?.places, place: body?.place }).toStrictEqual({
    places: [
      { words: 'tickets.example.com', trust: 'act', why: 'You book here every week.' },
      {
        words: 'library.example.org and every subdomain',
        trust: 'read',
        why: 'Your library splits its catalog.',
      },
    ],
    place: undefined,
  });
});

test('it adds every place of an approved proposal at its level', async () => {
  const ctx = await setupTest();

  const held = await ctx.hold({
    tool: 'places.propose',
    cause: 'always_ask',
    input: ctx.proposal,
    destinations: [],
    effects: ['policy_widen'],
  });

  await held.approve({});

  const places = await readPlaces(ctx.log);

  expect(places.map((place) => [place.key, place.trust, place.addedBy])).toStrictEqual([
    [ctx.site, 'act', 'proposal'],
    [{ kind: 'site', domain: 'library.example.org', subdomains: true }, 'read', 'proposal'],
  ]);
});

test('it adds only the ticked places of an approved proposal', async () => {
  const ctx = await setupTest();

  const held = await ctx.hold({
    tool: 'places.propose',
    cause: 'always_ask',
    input: ctx.proposal,
    destinations: [],
    effects: ['policy_widen'],
  });

  await held.approve({ tickedPlaces: [1] });

  const places = await readPlaces(ctx.log);

  expect(places.map((place) => place.key)).toStrictEqual([
    { kind: 'site', domain: 'library.example.org', subdomains: true },
  ]);
});

test('it leaves the directory as it is for a proposal that ticks nothing', async () => {
  const ctx = await setupTest();

  const held = await ctx.hold({
    tool: 'places.propose',
    cause: 'always_ask',
    input: ctx.proposal,
    destinations: [],
    effects: ['policy_widen'],
  });

  await held.approve({ tickedPlaces: [] });

  const places = await readPlaces(ctx.log);

  expect(places).toStrictEqual([]);
});

test('it lifts a block that an approved proposal names, and never lowers a place', async () => {
  const ctx = await setupTest();

  await ctx.addPlace(ctx.site, 'blocked');
  await ctx.addPlace({ kind: 'site', domain: 'library.example.org', subdomains: true }, 'act');

  const held = await ctx.hold({
    tool: 'places.propose',
    cause: 'always_ask',
    input: ctx.proposal,
    destinations: [],
    effects: ['policy_widen'],
  });

  await held.approve({});

  const places = await readPlaces(ctx.log);

  expect(places.map((place) => place.trust)).toStrictEqual(['act', 'act']);
});
