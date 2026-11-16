import { expect, test } from 'bun:test';
import { buildMockDefinitionBrief } from '../test-utils/build-mock-definition-brief';
import { buildMockMessageBrief } from '../test-utils/build-mock-message-brief';
import { renderBriefEnvelope } from './render-brief-envelope';

function setupTest() {
  return {
    times: { defaultZone: 'Australia/Sydney', now: new Date('2026-11-06T09:00:00Z') },
    buildMessaging: (name: string | null) => ({
      directory:
        name === null
          ? []
          : [
              {
                taskID: 'k3vq8m2xpa',
                name,
                brief: 'Check the greenhouse.',
                isWokenByMessages: true,
                speaker: 'plain_task' as const,
              },
            ],
      ownerName: 'Robin',
      agentName: 'Aria',
    }),
  };
}

test("it renders a definition's brief as a request from the task definition, with its brief ID and no reply-to", () => {
  const ctx = setupTest();

  const envelope = renderBriefEnvelope(
    buildMockDefinitionBrief(),
    { taskID: 'k3vq8m2xpa', times: ctx.times, messaging: ctx.buildMessaging('Greenhouse check') },
    () => 'f00d',
  );

  expect(envelope).toBe(
    [
      '<task-message id="d4h9" from="task definition: Greenhouse check" kind="request" sent="Fri 6 Nov, 19:00, Sydney" fence="f00d">',
      'Check the greenhouse sensors and report what is out of range.',
      '</task-message fence="f00d">',
    ].join('\n'),
  );
});

test('it names the definition by its task ID when the directory holds no name', () => {
  const ctx = setupTest();

  const envelope = renderBriefEnvelope(buildMockDefinitionBrief(), {
    taskID: 'k3vq8m2xpa',
    times: ctx.times,
    messaging: ctx.buildMessaging(null),
  });

  expect(envelope).toInclude('from="task definition: k3vq8m2xpa"');
});

test('it keeps a slot in the name of a definition as text', () => {
  const ctx = setupTest();

  const envelope = renderBriefEnvelope(buildMockDefinitionBrief(), {
    taskID: 'k3vq8m2xpa',
    times: ctx.times,
    messaging: ctx.buildMessaging('Tell {owner} {agent}'),
  });

  expect(envelope).toInclude('from="task definition: Tell {owner} {agent}"');
});

test("it renders a message brief with its message ID and its sender's label", () => {
  const ctx = setupTest();

  const envelope = renderBriefEnvelope(buildMockMessageBrief(), {
    taskID: 'k3vq8m2xpa',
    times: ctx.times,
    messaging: ctx.buildMessaging(null),
  });

  expect(envelope).toInclude('<task-message id="m7k2" from="task: conversation"');
});
