import { replacePushSubscription } from '../replace-push-subscription.ts';
import { formatCallError } from './format-call-error.ts';
import { getElement } from './get-element.ts';
import { requestPush } from './request-push.ts';
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

  result.textContent = await replacePushSubscription(
    page.registration.pushManager,
    page.vapidPublicKey,
  ).then(
    (subscription) =>
      page.client
        .subscribe({
          endpoint: subscription.endpoint ?? '',
          keys: {
            p256dh: subscription.keys?.['p256dh'] ?? '',
            auth: subscription.keys?.['auth'] ?? '',
          },
        })
        .then(() => 'Subscribed', formatCallError),
    (error: unknown) => `Not subscribed: ${String(error)}`,
  );
});

getElement('#send', HTMLButtonElement).addEventListener('click', async () => {
  getElement('#send-result', HTMLElement).textContent = await requestPush(page.client, {
    delaySeconds: Number(getElement('#delay', HTMLInputElement).value),
    urgency: getElement('#urgency', HTMLSelectElement).value,
    tag: getElement('#tag', HTMLInputElement).value,
    silent: getElement('#silent', HTMLInputElement).checked,
    renotify: getElement('#renotify', HTMLInputElement).checked,
  });
});
