import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { buildToolRegistry } from '../build-tool-registry';
import { buildMockToolDefinition } from '../test-utils/build-mock-tool-definition';
import { probePreparedAsApproved } from './probe-prepared-as-approved';

test('it accepts a tool that has no prepare step', async () => {
  const registered = buildToolRegistry([buildMockToolDefinition({ name: 'image_draw' })]).findTool(
    'image_draw',
  );

  invariant(registered, 'the tool is registered');

  const isApproved = await probePreparedAsApproved(registered, {}, ['openai']);

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

  const isApproved = await probePreparedAsApproved(registered, {}, ['openai']);

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

  const isApproved = await probePreparedAsApproved(registered, {}, ['openai']);

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

  const isApproved = await probePreparedAsApproved(registered, {}, ['openai']);

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

  const isApproved = await probePreparedAsApproved(registered, {}, ['openai']);

  expect(isApproved).toBe(true);
});
