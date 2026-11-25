import { expect, mock, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LiveConnection } from '../live/live-connection';
import { store } from '../mocks/store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { HandoverBanner } from './handover-banner';

function setupTest() {
  return { onTakeOver: mock<() => void>() };
}

test('it shows nothing while no ask stands', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const rendered = render(
    <>
      <LiveConnection />
      <HandoverBanner onTakeOver={ctx.onTakeOver} />
    </>,
  );

  await waitFor(() => {
    expect(rendered.container).toBeEmptyDOMElement();
  });
});

test('it shows the reason and a Take over button for an ask that stands when the page opens', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.records.create({
    kind: 'computer.handover_asked',
    message: { text: 'itch.io asks for a CAPTCHA' },
  });

  const rendered = render(
    <>
      <LiveConnection />
      <HandoverBanner onTakeOver={ctx.onTakeOver} />
    </>,
  );

  const banner = await rendered.findByRole('region', {
    name: 'the assistant asks you to take over the computer',
  });

  expect(banner).toHaveTextContent(
    'The assistant asks you to take over the computer: itch.io asks for a CAPTCHA',
  );
});

test('it shows the banner when the ask arrives on the live stream', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const rendered = render(
    <>
      <LiveConnection />
      <HandoverBanner onTakeOver={ctx.onTakeOver} />
    </>,
  );

  await waitFor(() => {
    expect(rendered.container).toBeEmptyDOMElement();
  });

  await store.records.create({
    kind: 'computer.handover_asked',
    message: { text: 'a bank check' },
  });

  const banner = await rendered.findByRole(
    'region',
    { name: 'the assistant asks you to take over the computer' },
    { timeout: 4000 },
  );

  expect(banner).toHaveTextContent('a bank check');
});

test.each(['computer.handover_closed', 'computer.takeover_started'])(
  'it clears the banner when a %s record arrives',
  async (kind) => {
    const ctx = setupTest();

    await createDeviceSession();

    await store.records.create({
      kind: 'computer.handover_asked',
      message: { text: 'a bank check' },
    });

    const rendered = render(
      <>
        <LiveConnection />
        <HandoverBanner onTakeOver={ctx.onTakeOver} />
      </>,
    );

    await rendered.findByRole('region', {
      name: 'the assistant asks you to take over the computer',
    });

    await store.records.create({ kind });

    await waitFor(
      () => {
        expect(rendered.container).toBeEmptyDOMElement();
      },
      { timeout: 4000 },
    );
  },
);

test('it takes the user to the computer when they press Take over', async () => {
  const ctx = setupTest();
  const user = userEvent.setup();

  await createDeviceSession();

  await store.records.create({
    kind: 'computer.handover_asked',
    message: { text: 'a bank check' },
  });

  const rendered = render(
    <>
      <LiveConnection />
      <HandoverBanner onTakeOver={ctx.onTakeOver} />
    </>,
  );

  const button = await rendered.findByRole('button', { name: 'Take over' });

  await user.click(button);

  expect(ctx.onTakeOver).toHaveBeenCalledOnce();
});
