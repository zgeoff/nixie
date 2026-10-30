import { outboxSyncTag } from '../../src/contract.ts';
import { getElement } from './get-element.ts';
import { startPage } from './start-page.ts';

const page = await startPage();
const sync = isSyncCapable(page.registration) ? page.registration.sync : null;

getElement('#support', HTMLElement).textContent =
  `Background sync: ${sync === null ? 'not supported' : 'supported'}`;
page.pollLog(['sync']);

const renderQueues = async () => {
  const waiting = await page.store.listMessages();
  const refused = await page.store.listRefused();

  getElement('#outbox', HTMLElement).replaceChildren(
    ...(waiting.length === 0 ? ['empty'] : waiting.map((message) => `${message.id} ${message.text}`))
      .map(toItem),
  );
  getElement('#refused', HTMLElement).replaceChildren(
    ...(refused.length === 0
      ? ['none']
      : refused.map((message) => `${message.status} ${message.reason}: ${message.text}`)
    ).map(toItem),
  );
};

void renderQueues();
setInterval(() => void renderQueues(), 3000);

getElement('#queue', HTMLButtonElement).addEventListener('click', async () => {
  await page.store.addMessage({
    id: crypto.randomUUID(),
    text: getElement('#text', HTMLInputElement).value,
    queuedAt: Date.now(),
  });
  await sync?.register(outboxSyncTag);
  getElement('#queue-result', HTMLElement).textContent =
    `Queued at ${new Date().toLocaleTimeString()}`;
  await renderQueues();
});

// TypeScript's DOM types leave out the Background Synchronization API.
function isSyncCapable(
  registration: object,
): registration is { sync: { register: (tag: string) => Promise<void> } } {
  return (
    'sync' in registration &&
    typeof registration.sync === 'object' &&
    registration.sync !== null &&
    'register' in registration.sync &&
    typeof registration.sync.register === 'function'
  );
}

function toItem(line: string): HTMLLIElement {
  const item = document.createElement('li');

  item.textContent = line;

  return item;
}
