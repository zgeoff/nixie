import { expect, test } from 'bun:test';
import { buildStartedDirectory } from './build-started-directory';

test('it lists the conversation and the started task under its ID', () => {
  const messaging = buildStartedDirectory('k3x9m2p7qa');

  expect(messaging.directory.map((task) => [task.taskID, task.name, task.speaker])).toStrictEqual([
    ['conversation', 'Conversation', 'conversation'],
    ['k3x9m2p7qa', 'Tide tables', 'plain_task'],
  ]);

  expect(messaging.hopLimit).toBe(20);
});
