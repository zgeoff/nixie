import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { buildToolRegistry } from '../build-tool-registry';
import { buildMockToolContext } from '../test-utils/build-mock-tool-context';
import { buildMockToolDefinition } from '../test-utils/build-mock-tool-definition';
import { probePreparedAsApproved } from './probe-prepared-as-approved';

test('it accepts a tool that has no prepare step', async () => {
  const registered = buildToolRegistry([buildMockToolDefinition({ name: 'image_draw' })]).findTool(
    'image_draw',
  );

  invariant(registered, 'the tool is registered');

  const isApproved = await probePreparedAsApproved(
    registered,
    {},
    ['openai'],
    buildMockToolContext(),
  );

  expect(isApproved).toBe(true);
});

test('it accepts destinations equal to the approved ones', async () => {
  const registered = buildToolRegistry([
    buildMockToolDefinition({
      name: 'image_draw',
      prepare: () => Promise.resolve({ destinations: ['openai'] }),
    }),
  ]).findTool('image_draw');

  invariant(registered, 'the tool is registered');

  const isApproved = await probePreparedAsApproved(
    registered,
    {},
    ['openai'],
    buildMockToolContext(),
  );

  expect(isApproved).toBe(true);
});

test('it refuses a destination that differs from the approved one', async () => {
  const registered = buildToolRegistry([
    buildMockToolDefinition({
      name: 'image_draw',
      prepare: () => Promise.resolve({ destinations: ['gemini'] }),
    }),
  ]).findTool('image_draw');

  invariant(registered, 'the tool is registered');

  const isApproved = await probePreparedAsApproved(
    registered,
    {},
    ['openai'],
    buildMockToolContext(),
  );

  expect(isApproved).toBe(false);
});

test('it refuses a destination that was not approved', async () => {
  const registered = buildToolRegistry([
    buildMockToolDefinition({
      name: 'image_draw',
      prepare: () => Promise.resolve({ destinations: ['openai', 'gemini'] }),
    }),
  ]).findTool('image_draw');

  invariant(registered, 'the tool is registered');

  const isApproved = await probePreparedAsApproved(
    registered,
    {},
    ['openai'],
    buildMockToolContext(),
  );

  expect(isApproved).toBe(false);
});

test('it leaves a prepare step that now ends the call to the tool, which refuses', async () => {
  const registered = buildToolRegistry([
    buildMockToolDefinition({
      name: 'image_draw',
      prepare: () => Promise.resolve({ result: {}, refusalCode: 'IMAGE_FORGOTTEN' }),
    }),
  ]).findTool('image_draw');

  invariant(registered, 'the tool is registered');

  const isApproved = await probePreparedAsApproved(
    registered,
    {},
    ['openai'],
    buildMockToolContext(),
  );

  expect(isApproved).toBe(true);
});

test('it hands the prepare step the run it reads the destination for', async () => {
  const context = buildMockToolContext({ run: { thread: 'task-9' } });
  const seen: string[] = [];

  const registered = buildToolRegistry([
    buildMockToolDefinition({
      name: 'image_draw',
      prepare: (_input, given) => {
        seen.push(given.run.thread);

        return Promise.resolve({ destinations: ['openai'] });
      },
    }),
  ]).findTool('image_draw');

  invariant(registered, 'the tool is registered');

  await probePreparedAsApproved(registered, {}, ['openai'], context);

  expect(seen).toStrictEqual(['task-9']);
});
