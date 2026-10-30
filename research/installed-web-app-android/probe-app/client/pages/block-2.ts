import { formatCallError } from './format-call-error.ts';
import { getElement } from './get-element.ts';
import { startPage } from './start-page.ts';

const page = await startPage();

getElement('#actions', HTMLElement).textContent =
  `Notification.maxActions: ${'maxActions' in Notification ? String(Notification.maxActions) : 'not defined'}`;
page.pollLog(['approve', 'push-sent', 'push-received']);

getElement('#send', HTMLButtonElement).addEventListener('click', async () => {
  getElement('#send-result', HTMLElement).textContent = await page.client
    .push({
      title: 'Approve a test item?',
      urgency: 'high',
      tag: 'approval',
      silent: false,
      renotify: false,
      approve: true,
      delaySeconds: Number(getElement('#delay', HTMLInputElement).value),
    })
    .then((sent) => JSON.stringify(sent), formatCallError);
});

getElement('#sign-out', HTMLButtonElement).addEventListener('click', async () => {
  getElement('#sign-out-result', HTMLElement).textContent = await page.client
    .signOut()
    .then((result) => JSON.stringify(result), formatCallError);
});
