import { getElement } from './get-element.ts';
import { startPage } from './start-page.ts';

const page = await startPage();
const standalone = matchMedia('(display-mode: standalone)').matches;

getElement('#worker', HTMLElement).textContent =
  `Service worker: ${page.registration.active === null ? 'installing' : 'active'}\n` +
  `Display mode: ${standalone ? 'standalone (installed app)' : 'browser tab'}`;
