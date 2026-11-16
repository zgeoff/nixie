import { expect, test } from 'bun:test';
import { buildMockDefinitionBrief } from './build-mock-definition-brief';

test("it builds the brief of a definition's task run", () => {
  expect(buildMockDefinitionBrief()).toStrictEqual({
    origin: 'definition',
    briefID: 'd4h9',
    sequence: 18_200,
    sentAt: new Date('2026-11-06T08:00:00Z'),
    body: 'Check the greenhouse sensors and report what is out of range.',
  });
});
