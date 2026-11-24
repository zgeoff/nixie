import { expect, test } from 'bun:test';
import { useQuery } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { publishMockChanged } from '../mocks/mock-live';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { useNixieClient } from '../utils/use-nixie-client';
import { LiveConnection } from './live-connection';

interface ProbeProps {
  readonly isFirstAnswered: boolean;
}

// The probe reads the nixie topic. The test answers each read, so it decides which read is in
// flight when an opened or a changed event arrives. A probe with isFirstAnswered answers its first
// read at once.
function setupTest() {
  const reads: PromiseWithResolvers<string>[] = [];

  const Probe = (props: ProbeProps): ReactNode => {
    const nixie = useNixieClient();

    const query = useQuery({
      queryKey: nixie.queryUtils.nixie.read.queryKey(),
      queryFn: () => {
        const read = Promise.withResolvers<string>();

        reads.push(read);

        if (props.isFirstAnswered && reads.length === 1) {
          read.resolve('first');
        }

        return read.promise;
      },
    });

    return <p>{query.data ?? 'loading'}</p>;
  };

  return { reads, Probe };
}

test('it reads a topic again when a changed event arrives while a read of that topic is in flight', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const rendered = render(
    <>
      <LiveConnection />
      <ctx.Probe isFirstAnswered />
    </>,
  );

  // the stream's first open reads every topic again, and that read waits
  await waitFor(() => {
    expect(ctx.reads).toHaveLength(2);
  });

  publishMockChanged(['nixie']);

  await waitFor(() => {
    expect(ctx.reads).toHaveLength(3);
  });

  ctx.reads[1]?.resolve('before the change');
  ctx.reads[2]?.resolve('after the change');

  const shown = await rendered.findByText('after the change');

  expect(shown).toBeVisible();
});

test('it reads a topic again on opened and on changed when its first read is still in flight', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const rendered = render(
    <>
      <LiveConnection />
      <ctx.Probe isFirstAnswered={false} />
    </>,
  );

  // the stream's first open reads the topic again, though the topic has no data yet
  await waitFor(() => {
    expect(ctx.reads).toHaveLength(2);
  });

  publishMockChanged(['nixie']);

  await waitFor(() => {
    expect(ctx.reads).toHaveLength(3);
  });

  ctx.reads[0]?.resolve('before opened');
  ctx.reads[1]?.resolve('before the change');
  ctx.reads[2]?.resolve('after the change');

  const shown = await rendered.findByText('after the change');

  expect(shown).toBeVisible();
});
