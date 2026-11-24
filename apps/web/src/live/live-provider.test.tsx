import { expect, test } from 'bun:test';
import { useQuery } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { publishMockChanged } from '../mocks/mock-live';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { useNixieClient } from '../utils/use-nixie-client';
import { LiveConnection } from './live-connection';

// The first read answers at once. Each later read waits for the test to answer it, so the test
// decides which read is in flight when a changed event arrives.
function setupTest() {
  const reads: PromiseWithResolvers<string>[] = [];

  const Probe = (): ReactNode => {
    const nixie = useNixieClient();

    const query = useQuery({
      queryKey: nixie.queryUtils.nixie.read.queryKey(),
      queryFn: () => {
        const read = Promise.withResolvers<string>();

        reads.push(read);

        if (reads.length === 1) {
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
      <ctx.Probe />
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
