import { adminHeaderName, pushInputSchema } from '../../src/contract.ts';
import { formatCallError } from './format-call-error.ts';
import { getElement } from './get-element.ts';
import { startPage } from './start-page.ts';

const page = await startPage({
  [adminHeaderName]: new URLSearchParams(location.search).get('key') ?? '',
});

page.pollLog(['subscribed', 'push-sent', 'push-received', 'approve', 'share', 'sync']);

const renderSubscriptions = async () => {
  const lines = await page.client.subscriptions().then(
    (subscriptions) =>
      subscriptions.length === 0
        ? ['none yet']
        : subscriptions.map((entry) => `${entry.session ?? 'no session'} via ${entry.pushService}`),
    (error: unknown) => [
      `refused: ${formatCallError(error)}, open the address the server prints`,
    ],
  );

  getElement('#subscriptions', HTMLElement).replaceChildren(
    ...lines.map((line) => {
      const item = document.createElement('li');

      item.textContent = line;

      return item;
    }),
  );
};

void renderSubscriptions();
setInterval(() => void renderSubscriptions(), 5000);

getElement('#send', HTMLButtonElement).addEventListener('click', async () => {
  getElement('#send-result', HTMLElement).textContent = await page.client
    .push(
      pushInputSchema.parse({
        title: getElement('#title', HTMLInputElement).value,
        delaySeconds: Number(getElement('#delay', HTMLInputElement).value),
        urgency: getElement('#urgency', HTMLSelectElement).value,
        tag: getElement('#tag', HTMLInputElement).value,
        silent: getElement('#silent', HTMLInputElement).checked,
        renotify: getElement('#renotify', HTMLInputElement).checked,
        approve: getElement('#approve', HTMLInputElement).checked,
      }),
    )
    .then((sent) => JSON.stringify(sent), formatCallError);
});
