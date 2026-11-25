import { expect, test } from 'bun:test';
import { startTestMail } from './start-test-mail';

test('it calls a mail tool as the conversation', async () => {
  const mail = await startTestMail();
  const listed = await mail.callTool('mail.wake_list', {});

  expect(listed).toStrictEqual({ status: 'ok', result: { rules: [] } });
});

test('it refuses a tool that the module does not hold', async () => {
  const mail = await startTestMail();

  expect(() => mail.callTool('mail.nothing', {})).toThrow('the test holds no tool mail.nothing');
});
