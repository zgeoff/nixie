import { waitForPage } from './wait-for-page';

// The page's buttons carry no name or ID to select, so the page marks the enabled one with this
// text. view.click never returns for the button that starts the forget call, so the page clicks it.
export async function clickPageButton(view: Bun.WebView, label: string): Promise<void> {
  await waitForPage(
    view,
    `(() => {
      for (const marked of document.querySelectorAll('[data-click-target]')) {
        marked.removeAttribute('data-click-target');
      }

      const button = [...document.querySelectorAll('button')].find(
        (candidate) => candidate.innerText.trim() === ${JSON.stringify(label)} && !candidate.disabled,
      );

      button?.setAttribute('data-click-target', '');

      return button !== undefined;
    })()`,
  );

  await view.evaluate("document.querySelector('button[data-click-target]').click()");
}
