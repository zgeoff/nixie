import { expect, test } from 'bun:test';
import { buildMockToolContext } from '@heynixie/tools/test-utils';
import { readRunSkillList } from './read-run-skill-list';

function setupTest() {
  return { inForce: { conversationSkills: ['bird-log', 'tide-tables'] } };
}

test('it gives the conversation the list of the definitions', () => {
  const ctx = setupTest();
  const context = buildMockToolContext({ run: { thread: 'conversation' } });

  expect(readRunSkillList(context.run, ctx.inForce)).toStrictEqual(['bird-log', 'tide-tables']);
});

test('it gives a job run the list its definition set, and not the conversation list', () => {
  const ctx = setupTest();
  const context = buildMockToolContext({ run: { thread: 'task-a', skills: ['tide-tables'] } });

  expect(readRunSkillList(context.run, ctx.inForce)).toStrictEqual(['tide-tables']);
});

test('it gives a job run whose definition lists none an empty list', () => {
  const ctx = setupTest();
  const context = buildMockToolContext({ run: { thread: 'task-a', skills: [] } });

  expect(readRunSkillList(context.run, ctx.inForce)).toStrictEqual([]);
});

test('it gives a worker run on the conversation thread only the skills its call named', () => {
  const ctx = setupTest();

  const context = buildMockToolContext({
    run: { thread: 'conversation', skills: ['tide-tables'] },
  });

  expect(readRunSkillList(context.run, ctx.inForce)).toStrictEqual(['tide-tables']);
});

test('it gives a run with no skill list and no conversation thread an empty list', () => {
  const ctx = setupTest();
  const context = buildMockToolContext({ run: { thread: 'task-a' } });

  expect(readRunSkillList(context.run, ctx.inForce)).toStrictEqual([]);
});
