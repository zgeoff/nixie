import { expect, mock, onTestFinished, test } from 'bun:test';
import { buildQueryUtils } from '@heynixie/contract';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react';
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { buildBrowserClient } from '../client/build-browser-client';
import { NixieClientContext } from '../utils/nixie-client-context';
import { MandateForm } from './mandate-form';

function setupTest() {
  const client = buildBrowserClient();
  const nixie = { client, queryUtils: buildQueryUtils(client) };

  const queryClient = new QueryClient();

  const page = (
    <QueryClientProvider client={queryClient}>
      <NixieClientContext value={nixie}>
        <MandateForm />
      </NixieClientContext>
    </QueryClientProvider>
  );

  return { page };
}

test('it keeps the fields and the button disabled in the server render and enables them once the page hydrates', async () => {
  const ctx = setupTest();
  const container = document.createElement('div');
  const failed = mock();

  container.innerHTML = renderToString(ctx.page);

  document.body.append(container);

  const isDisabled = () => container.querySelector('fieldset')?.disabled;
  const before = isDisabled();

  const root = await act(() =>
    hydrateRoot(container, ctx.page, {
      onRecoverableError: (error) => {
        failed(error);
      },
    }),
  );

  onTestFinished(() => {
    root.unmount();
    container.remove();
  });

  await waitFor(() => {
    expect(isDisabled()).toBe(false);
  });

  expect([
    before,
    container.querySelectorAll('fieldset div[aria-label="Rule 1"]').length,
    container.querySelectorAll('fieldset button[name=propose]').length,
    failed.mock.calls.length,
  ]).toStrictEqual([true, 1, 1, 0]);
});
