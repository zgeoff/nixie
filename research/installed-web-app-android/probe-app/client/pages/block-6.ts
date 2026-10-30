import { formatCallError } from './format-call-error.ts';
import { getElement } from './get-element.ts';
import { startPage } from './start-page.ts';

const page = await startPage();
const shareID = new URLSearchParams(location.search).get('share');

if (shareID !== null) {
  getElement('#share', HTMLElement).textContent = await page.client
    .entry({ id: shareID })
    .then((entry) => JSON.stringify(entry, null, 1), formatCallError);
}

page.pollLog(['share']);
