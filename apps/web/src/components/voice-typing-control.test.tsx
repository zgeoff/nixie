import { expect, test } from 'bun:test';
import userEvent from '@testing-library/user-event';
import { MicrophoneContext } from '../microphone-context';
import { buildStubMicrophone } from '../test-utils/build-stub-microphone';
import { render } from '../test-utils/render';
import { VoiceTypingControl } from './voice-typing-control';

test('it offers to turn on voice typing when the browser has not asked for the microphone', async () => {
  const stub = buildStubMicrophone({ permission: 'prompt', answer: 'allow' });

  const rendered = render(
    <MicrophoneContext value={stub.microphone}>
      <VoiceTypingControl />
    </MicrophoneContext>,
  );

  const button = await rendered.findByRole('button', { name: 'Turn on voice typing' });

  expect(button).toBeEnabled();
  expect(stub.readRequests()).toStrictEqual([]);
});

test('it asks for the microphone once, stops every track at once, and shows voice typing on', async () => {
  const user = userEvent.setup();
  const stub = buildStubMicrophone({ permission: 'prompt', answer: 'allow' });

  const rendered = render(
    <MicrophoneContext value={stub.microphone}>
      <VoiceTypingControl />
    </MicrophoneContext>,
  );

  const button = await rendered.findByRole('button', { name: 'Turn on voice typing' });

  await user.click(button);

  const status = await rendered.findByRole('status');

  expect(status).toHaveTextContent('Voice typing on');
  expect(stub.readRequests()).toStrictEqual([{ audio: true }]);

  expect(stub.readTracks()).toStrictEqual([
    { kind: 'audio', readyState: 'ended', stop: expect.any(Function) },
  ]);

  expect(rendered.queryByRole('button')).toBeNull();
});

test('it shows voice typing on without asking again when the microphone is already allowed', async () => {
  const stub = buildStubMicrophone({ permission: 'granted', answer: 'allow' });

  const rendered = render(
    <MicrophoneContext value={stub.microphone}>
      <VoiceTypingControl />
    </MicrophoneContext>,
  );

  const status = await rendered.findByRole('status');

  expect(status).toHaveTextContent('Voice typing on');
  expect(stub.readRequests()).toStrictEqual([]);
});

test('it shows how to unblock the microphone when the user blocks the prompt', async () => {
  const user = userEvent.setup();
  const stub = buildStubMicrophone({ permission: 'prompt', answer: 'block' });

  const rendered = render(
    <MicrophoneContext value={stub.microphone}>
      <VoiceTypingControl />
    </MicrophoneContext>,
  );

  const button = await rendered.findByRole('button', { name: 'Turn on voice typing' });

  await user.click(button);

  const summary = await rendered.findByText('Voice typing blocked');

  await user.click(summary);

  expect(rendered.getByRole('list')).toHaveTextContent(
    'In Chrome, tap the icon to the left of the address bar, then Permissions. In the installed app, long-press the nixie icon and tap Site settings.Set Microphone to Allow.If Chrome itself has no microphone access, allow it in Android Settings, under Apps, Chrome, Permissions.',
  );
});

test('it shows how to unblock the microphone without asking when the site is already blocked', async () => {
  const stub = buildStubMicrophone({ permission: 'denied', answer: 'allow' });

  const rendered = render(
    <MicrophoneContext value={stub.microphone}>
      <VoiceTypingControl />
    </MicrophoneContext>,
  );

  await rendered.findByText('Voice typing blocked');

  expect(rendered.getByText('Set Microphone to Allow.')).toBeInTheDocument();
  expect(stub.readRequests()).toStrictEqual([]);
});

test('it shows voice typing on once the user allows the microphone in the site settings', async () => {
  const stub = buildStubMicrophone({ permission: 'denied', answer: 'allow' });

  const rendered = render(
    <MicrophoneContext value={stub.microphone}>
      <VoiceTypingControl />
    </MicrophoneContext>,
  );

  await rendered.findByText('Voice typing blocked');

  stub.setPermission('granted');

  const status = await rendered.findByRole('status');

  expect(status).toHaveTextContent('Voice typing on');
});

test('it offers to turn on voice typing again when the user closes the prompt', async () => {
  const user = userEvent.setup();
  const stub = buildStubMicrophone({ permission: 'prompt', answer: 'dismiss' });

  const rendered = render(
    <MicrophoneContext value={stub.microphone}>
      <VoiceTypingControl />
    </MicrophoneContext>,
  );

  const button = await rendered.findByRole('button', { name: 'Turn on voice typing' });

  await user.click(button);

  const again = await rendered.findByRole('button', { name: 'Turn on voice typing' });

  expect(again).toBeEnabled();
  expect(stub.readRequests()).toHaveLength(1);
});

test('it shows how to unblock the microphone after a refusal when the browser cannot query the permission', async () => {
  const user = userEvent.setup();
  const stub = buildStubMicrophone({ permission: 'unsupported', answer: 'block' });

  const rendered = render(
    <MicrophoneContext value={stub.microphone}>
      <VoiceTypingControl />
    </MicrophoneContext>,
  );

  const button = await rendered.findByRole('button', { name: 'Turn on voice typing' });

  await user.click(button);

  const summary = await rendered.findByText('Voice typing blocked');

  expect(summary).toBeInTheDocument();
});

test('it asks again from the blocked state once the user taps Try again', async () => {
  const user = userEvent.setup();
  const stub = buildStubMicrophone({ permission: 'unsupported', answer: 'block' });

  const rendered = render(
    <MicrophoneContext value={stub.microphone}>
      <VoiceTypingControl />
    </MicrophoneContext>,
  );

  const button = await rendered.findByRole('button', { name: 'Turn on voice typing' });

  await user.click(button);

  const summary = await rendered.findByText('Voice typing blocked');

  await user.click(summary);
  await user.click(rendered.getByRole('button', { name: 'Try again' }));

  const blockedAgain = await rendered.findByText('Voice typing blocked');

  expect(blockedAgain).toBeInTheDocument();
  expect(stub.readRequests()).toHaveLength(2);
});

test('it reports a microphone that does not start, with a way to try again', async () => {
  const user = userEvent.setup();
  const stub = buildStubMicrophone({ permission: 'prompt', answer: 'missing' });

  const rendered = render(
    <MicrophoneContext value={stub.microphone}>
      <VoiceTypingControl />
    </MicrophoneContext>,
  );

  const button = await rendered.findByRole('button', { name: 'Turn on voice typing' });

  await user.click(button);

  const alert = await rendered.findByRole('alert');

  expect(alert).toHaveTextContent('The microphone did not start. Try again');
});

test('it says voice typing needs HTTPS when the page has no media devices', async () => {
  const stub = buildStubMicrophone({
    permission: 'prompt',
    answer: 'allow',
    hasMediaDevices: false,
  });

  const rendered = render(
    <MicrophoneContext value={stub.microphone}>
      <VoiceTypingControl />
    </MicrophoneContext>,
  );

  const notice = await rendered.findByText('Voice typing needs nixie over HTTPS.');

  expect(notice).toBeInTheDocument();
});
