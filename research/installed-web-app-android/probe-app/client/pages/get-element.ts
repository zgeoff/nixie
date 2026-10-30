// Finds an element the page's HTML declares; a missing one is a bug in the page.
export function getElement<T extends Element>(selector: string, type: { new (): T }): T {
  const element = document.querySelector(selector);

  if (!(element instanceof type)) {
    throw new Error(`the page has no ${type.name} at ${selector}`);
  }

  return element;
}
