import { pushInputSchema } from '../../src/contract.ts';
import { formatCallError } from './format-call-error.ts';
import { getElement } from './get-element.ts';
import { startPage } from './start-page.ts';

const page = await startPage();
const permission = getElement('#permission', HTMLElement);
const showPermission = () => {
  permission.textContent = `Permission: ${Notification.permission}`;
};

showPermission();
page.pollLog(['subscribed', 'push-sent', 'push-received']);

getElement('#subscribe', HTMLButtonElement).addEventListener('click', async () => {
  const result = getElement('#subscribe-result', HTMLElement);
  const granted = await Notification.requestPermission();

  showPermission();

  if (granted !== 'granted') {
    result.textContent = `Not subscribed: permission ${granted}`;

    return;
  }

  const existing = await page.registration.pushManager.getSubscription();
  const existingKey = existing?.options.applicationServerKey;

  // a subscription made under another server key cannot be reused
  if (
    existing !== null &&
    existingKey !== null &&
    existingKey !== undefined &&
    btoa(String.fromCharCode(...new Uint8Array(existingKey)))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '') !== page.vapidPublicKey
  ) {
    await existing.unsubscribe();
  }

  const subscription = (
    await page.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: page.vapidPublicKey,
    })
  ).toJSON();

  result.textContent = await page.client
    .subscribe({
      endpoint: subscription.endpoint ?? '',
      keys: { p256dh: subscription.keys?.['p256dh'] ?? '', auth: subscription.keys?.['auth'] ?? '' },
    })
    .then(() => 'Subscribed', formatCallError);
});

getElement('#send', HTMLButtonElement).addEventListener('click', async () => {
  getElement('#send-result', HTMLElement).textContent = await page.client
    .push(
      pushInputSchema.parse({
        delaySeconds: Number(getElement('#delay', HTMLInputElement).value),
        urgency: getElement('#urgency', HTMLSelectElement).value,
        tag: getElement('#tag', HTMLInputElement).value,
        silent: getElement('#silent', HTMLInputElement).checked,
        renotify: getElement('#renotify', HTMLInputElement).checked,
      }),
    )
    .then((sent) => JSON.stringify(sent), formatCallError);
});
