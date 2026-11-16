import { expect, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { store } from '../mocks/store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { WorkerLine } from './worker-line';

test('it shows the collapsed line with its outcome and usage, and the question, answer, sources and turns when opened', async () => {
  const user = userEvent.setup();

  const rendered = render(
    <WorkerLine
      worker={{
        call: {
          callID: 'call-1',
          content: { result: { answer: 'The peas came.', workerRunID: 'w1' } },
          input: { question: 'Which seeds came?' },
          outcome: 'result',
          tool: 'worker.run',
        },
        calls: [
          {
            callID: 'call-2',
            content: { result: { url: 'https://seeds.test/list' } },
            input: { url: 'https://seeds.test/list' },
            outcome: 'result',
            runID: 'w1',
            tool: 'web_fetch',
          },
        ],
        end: {
          isCut: false,
          outcome: 'answered',
          record: { sequence: 6, thread: 'k3vq8m2xpa' },
          used: { minutes: 1.5, turns: 1, tokens: 120, dollars: 0.01 },
        },
        shortID: 'w7k2m9qa4x',
        turns: [
          {
            dollars: 0.01,
            isCut: false,
            isForgotten: false,
            record: { sequence: 5, thread: 'k3vq8m2xpa' },
            text: 'The peas came.',
            tokens: 120,
            turn: 1,
          },
        ],
        workerRunID: 'w1',
      }}
    />,
  );

  const summary = rendered.getByText(
    'worker w7k2m9qa4x · Which seeds came? · answered · 1.5 min · 1 turn · 120 tokens · $0.01',
  );

  await user.click(summary);

  expect(rendered.getByRole('region', { name: 'Worker w7k2m9qa4x' })).toHaveTextContent(
    'Which seeds came?',
  );

  await user.click(rendered.getByText('Sources 1'));

  expect(rendered.getByText('web fetch: seeds.test/list')).toBeVisible();
});

test('it shows the text of a worker as plain text, never as markup', async () => {
  const user = userEvent.setup();

  const rendered = render(
    <WorkerLine
      worker={{
        call: {
          callID: 'call-1',
          content: { result: { answer: '<img src=x onerror=alert(1)> **bold**' } },
          input: { question: 'Q' },
          outcome: 'result',
          tool: 'worker.run',
        },
        calls: [],
        shortID: 'w7k2m9qa4x',
        turns: [],
        workerRunID: 'w1',
      }}
    />,
  );

  await user.click(rendered.getByText(/^worker w7k2m9qa4x/u));
  await user.click(rendered.getByText('Answer'));

  expect(rendered.container.querySelector('img')).toBeNull();
  expect(rendered.getByText('<img src=x onerror=alert(1)> **bold**')).toBeVisible();
});

test('it shows a forgotten answer as forgotten and keeps the usage and outcome', async () => {
  const user = userEvent.setup();

  const rendered = render(
    <WorkerLine
      worker={{
        call: { callID: 'call-1', isRemoved: true, outcome: 'result', tool: 'worker.run' },
        calls: [],
        end: {
          isCut: false,
          outcome: 'answered',
          record: { sequence: 6, thread: 'k3vq8m2xpa' },
          used: { minutes: 1, turns: 1, tokens: 10, dollars: 0.01 },
        },
        shortID: 'w7k2m9qa4x',
        turns: [],
        workerRunID: 'w1',
      }}
    />,
  );

  await user.click(
    rendered.getByText('worker w7k2m9qa4x · answered · 1.0 min · 1 turn · 10 tokens · $0.01'),
  );

  await user.click(rendered.getByText('Answer'));

  expect(rendered.getAllByText('Forgotten.')).toHaveLength(2);
});

test('it shows the limit and detail of a worker run that did not answer', async () => {
  const user = userEvent.setup();

  const rendered = render(
    <WorkerLine
      worker={{
        call: { callID: 'call-1', input: { question: 'Q' }, outcome: 'failed', tool: 'worker.run' },
        calls: [],
        end: {
          detail: 'the model service refused',
          isCut: false,
          limit: 'dollars',
          outcome: 'limit',
          record: { sequence: 6, thread: 'k3vq8m2xpa' },
          used: { minutes: 1, turns: 1, tokens: 10, dollars: 0.5 },
        },
        shortID: 'w7k2m9qa4x',
        turns: [],
        workerRunID: 'w1',
      }}
    />,
  );

  await user.click(rendered.getByText(/^worker w7k2m9qa4x/u));
  await user.click(rendered.getByText('Outcome'));

  expect(rendered.getByText('limit · dollars · the model service refused')).toBeVisible();
});

test('it loads the whole text of a cut turn in place of the cut one', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  const turn = await store.records.create({
    kind: 'worker.turn_ended',
    thread: 'k3vq8m2xpa',
    worker: {
      phase: 'turn',
      workerRunID: 'w1',
      callID: 'call-1',
      turn: 1,
      tokens: 10,
      dollars: 0,
      text: `${'a'.repeat(4096)}THE END`,
    },
  });

  const rendered = render(
    <WorkerLine
      worker={{
        call: { callID: 'call-1', input: { question: 'Q' }, outcome: 'result', tool: 'worker.run' },
        calls: [],
        shortID: 'w7k2m9qa4x',
        turns: [
          {
            dollars: 0,
            isCut: true,
            isForgotten: false,
            record: { sequence: turn.sequence, thread: 'k3vq8m2xpa' },
            text: 'a'.repeat(4096),
            tokens: 10,
            turn: 1,
          },
        ],
        workerRunID: 'w1',
      }}
    />,
  );

  await user.click(rendered.getByText(/^worker w7k2m9qa4x/u));
  await user.click(rendered.getByRole('button', { name: 'Load the whole value' }));

  await waitFor(() => {
    expect(rendered.getByRole('region', { name: 'Worker w7k2m9qa4x' })).toHaveTextContent(
      'THE END',
    );
  });

  expect(rendered.queryByRole('button', { name: 'Load the whole value' })).toBeNull();
});

test('it shows the failure and keeps the cut text when the whole text cannot load', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  const rendered = render(
    <WorkerLine
      worker={{
        call: { callID: 'call-1', input: { question: 'Q' }, outcome: 'result', tool: 'worker.run' },
        calls: [],
        shortID: 'w7k2m9qa4x',
        turns: [
          {
            dollars: 0,
            isCut: true,
            isForgotten: false,
            record: { sequence: 9999, thread: 'k3vq8m2xpa' },
            text: 'cut text',
            tokens: 10,
            turn: 1,
          },
        ],
        workerRunID: 'w1',
      }}
    />,
  );

  await user.click(rendered.getByText(/^worker w7k2m9qa4x/u));
  await user.click(rendered.getByRole('button', { name: 'Load the whole value' }));

  await waitFor(() => {
    expect(rendered.getByRole('alert')).toHaveTextContent('The whole value did not load.');
  });

  await user.click(rendered.getByText('Turns 1'));

  expect(rendered.getByText('cut text')).toBeVisible();
  expect(rendered.getByRole('button', { name: 'Try again' })).toBeEnabled();
});

test('it drops the whole text of a turn that is forgotten after it loaded', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  const turn = await store.records.create({
    kind: 'worker.turn_ended',
    thread: 'k3vq8m2xpa',
    worker: {
      phase: 'turn',
      workerRunID: 'w1',
      callID: 'call-1',
      turn: 1,
      tokens: 10,
      dollars: 0,
      text: `${'a'.repeat(4096)}THE END`,
    },
  });

  const record = { sequence: turn.sequence, thread: 'k3vq8m2xpa' };

  const call = {
    callID: 'call-1',
    input: { question: 'Q' },
    outcome: 'result',
    tool: 'worker.run',
  };

  const rendered = render(
    <WorkerLine
      worker={{
        call,
        calls: [],
        shortID: 'w7k2m9qa4x',
        turns: [
          {
            dollars: 0,
            isCut: true,
            isForgotten: false,
            record,
            text: 'a'.repeat(4096),
            tokens: 10,
            turn: 1,
          },
        ],
        workerRunID: 'w1',
      }}
    />,
  );

  await user.click(rendered.getByText(/^worker w7k2m9qa4x/u));
  await user.click(rendered.getByRole('button', { name: 'Load the whole value' }));

  await waitFor(() => {
    expect(rendered.getByRole('region', { name: 'Worker w7k2m9qa4x' })).toHaveTextContent(
      'THE END',
    );
  });

  rendered.rerender(
    <WorkerLine
      worker={{
        call,
        calls: [],
        shortID: 'w7k2m9qa4x',
        turns: [{ dollars: 0, isCut: false, isForgotten: true, record, tokens: 10, turn: 1 }],
        workerRunID: 'w1',
      }}
    />,
  );

  const region = rendered.getByRole('region', { name: 'Worker w7k2m9qa4x' });

  expect(region).not.toHaveTextContent('THE END');
  expect(region).toHaveTextContent('Forgotten.');
});

test('it offers the control again for a cut turn that arrives after an earlier load', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  const first = await store.records.create({
    kind: 'worker.turn_ended',
    thread: 'k3vq8m2xpa',
    worker: {
      phase: 'turn',
      workerRunID: 'w1',
      callID: 'call-1',
      turn: 1,
      tokens: 10,
      dollars: 0,
      text: `${'a'.repeat(4096)}FIRST END`,
    },
  });

  const second = await store.records.create({
    kind: 'worker.turn_ended',
    thread: 'k3vq8m2xpa',
    worker: {
      phase: 'turn',
      workerRunID: 'w1',
      callID: 'call-1',
      turn: 2,
      tokens: 10,
      dollars: 0,
      text: `${'b'.repeat(4096)}SECOND END`,
    },
  });

  const call = {
    callID: 'call-1',
    input: { question: 'Q' },
    outcome: 'result',
    tool: 'worker.run',
  };

  const turnOne = {
    dollars: 0,
    isCut: true,
    isForgotten: false,
    record: { sequence: first.sequence, thread: 'k3vq8m2xpa' },
    text: 'a'.repeat(4096),
    tokens: 10,
    turn: 1,
  };

  const rendered = render(
    <WorkerLine
      worker={{ call, calls: [], shortID: 'w7k2m9qa4x', turns: [turnOne], workerRunID: 'w1' }}
    />,
  );

  await user.click(rendered.getByText(/^worker w7k2m9qa4x/u));
  await user.click(rendered.getByRole('button', { name: 'Load the whole value' }));

  await waitFor(() => {
    expect(rendered.getByRole('region', { name: 'Worker w7k2m9qa4x' })).toHaveTextContent(
      'FIRST END',
    );
  });

  rendered.rerender(
    <WorkerLine
      worker={{
        call,
        calls: [],
        shortID: 'w7k2m9qa4x',
        turns: [
          turnOne,
          {
            ...turnOne,
            record: { sequence: second.sequence, thread: 'k3vq8m2xpa' },
            text: 'b'.repeat(4096),
            turn: 2,
          },
        ],
        workerRunID: 'w1',
      }}
    />,
  );

  await user.click(rendered.getByRole('button', { name: 'Load the whole value' }));

  await waitFor(() => {
    expect(rendered.getByRole('region', { name: 'Worker w7k2m9qa4x' })).toHaveTextContent(
      'SECOND END',
    );
  });
});
