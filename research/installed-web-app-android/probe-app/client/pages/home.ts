import { getElement } from './get-element.ts';
import { pairPhone } from './pair-phone.ts';
import { startPage } from './start-page.ts';

const page = await startPage();
const standalone = matchMedia('(display-mode: standalone)').matches;

getElement('#worker', HTMLElement).textContent =
  `Service worker: ${page.registration.active === null ? 'installing' : 'active'}\n` +
  `Display mode: ${standalone ? 'standalone (installed app)' : 'browser tab'}`;

getElement('#pair', HTMLButtonElement).addEventListener('click', () =>
  pairPhone(page.client, {
    code: getElement('#pair-code', HTMLInputElement),
    result: getElement('#pair-result', HTMLElement),
    session: getElement('#session', HTMLElement),
  }),
);
