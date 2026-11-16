import { expect, mock, onTestFinished, test } from 'bun:test';
import { startScriptedModel, waitForCondition } from '@heynixie/testing';
import { capturePath } from '@heynixie/wire';
import { startTestModelGateway } from './start-test-model-gateway';

test('it counts the tokens of a Responses reply on a route that names its API and model', async () => {
  const model = startScriptedModel();

  onTestFinished(() => model.stop());

  model.addReplies({ text: 'done', responsesUsage: { input_tokens: 100, output_tokens: 7 } });

  const gateway = await startTestModelGateway({
    upstreamURL: model.url,
    api: 'openai-responses',
    model: 'house-model-1',
  });

  const response = await fetch(`${gateway.baseURL}/v1/responses`, {
    method: 'POST',
    body: JSON.stringify({ model: 'house-model-1', input: 'Hi.' }),
  });

  await response.text();

  const probeCounted = async () => {
    const counted = await gateway.readCount();

    return counted.tokens === 107;
  };

  await waitForCondition(probeCounted);

  const count = await gateway.readCount();

  expect(count).toStrictEqual({ dollars: expect.toBeNumber(), tokens: 107 });
});

test('it listens on the port it is given', async () => {
  const model = startScriptedModel();

  onTestFinished(() => model.stop());

  const answerEmpty = mock(() => new Response(''));
  const probe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: answerEmpty });
  const port = probe.port ?? 0;

  await probe.stop(true);

  const gateway = await startTestModelGateway({ upstreamURL: model.url, port });

  expect(gateway.url).toBe(`http://127.0.0.1:${String(port)}`);
});

test('it refuses a request once the tokens counted reach the limit it is given', async () => {
  const model = startScriptedModel();

  onTestFinished(() => model.stop());

  model.addReplies({ text: 'done', responsesUsage: { input_tokens: 10, output_tokens: 5 } });

  const gateway = await startTestModelGateway({
    upstreamURL: model.url,
    api: 'openai-responses',
    limits: { tokens: 15 },
  });

  const ask = () =>
    fetch(`${gateway.baseURL}/v1/responses`, {
      method: 'POST',
      body: JSON.stringify({ model: 'claude-test-1', input: 'Hi.' }),
    });

  const first = await ask();

  await first.text();

  const probeCounted = async () => {
    const counted = await gateway.readCount();

    return counted.tokens === 15;
  };

  await waitForCondition(probeCounted);

  const refused = await ask();

  expect(refused.status).toBe(403);
});

test('it answers the capture ask with no when capture is off', async () => {
  const model = startScriptedModel();

  onTestFinished(() => model.stop());

  const gateway = await startTestModelGateway({ upstreamURL: model.url, capture: false });

  const answer = await fetch(
    `${gateway.url}${capturePath}?spool=${encodeURIComponent(gateway.spoolDir)}`,
  );

  const body = await answer.json();

  expect(body).toStrictEqual({ canCapture: false });
});
