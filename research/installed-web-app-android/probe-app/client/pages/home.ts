import { formatCallError } from './format-call-error.ts';
import { getElement } from './get-element.ts';
import { startPage } from './start-page.ts';

const page = await startPage();
const standalone = matchMedia('(display-mode: standalone)').matches;

getElement('#worker', HTMLElement).textContent =
  `Service worker: ${page.registration.active === null ? 'installing' : 'active'}\n` +
  `Display mode: ${standalone ? 'standalone (installed app)' : 'browser tab'}`;

getElement('#pair', HTMLButtonElement).addEventListener('click', async () => {
  getElement('#pair-result', HTMLElement).textContent = await page.client
    .pair({ code: getElement('#pair-code', HTMLInputElement).value })
    .then((paired) => {
      getElement('#session', HTMLElement).textContent = `Session: ${paired.session}`;

      return `Paired as ${paired.session}`;
    }, formatCallError);
});
