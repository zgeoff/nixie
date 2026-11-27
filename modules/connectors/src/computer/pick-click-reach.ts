import type { ClickedElement } from '@heynixie/wire';
import { findURLHost } from './find-url-host';

export interface ClickReach {
  // true for a link that only loads the page it points to
  readonly isPlainLink: boolean;
  readonly destinations: readonly string[];
}

// What a click on a control reaches: the host of the tab, and the host of any web address the
// control points to. Only a plain link just loads that page: any other control also acts on the
// tab's page.
export function pickClickReach(element: ClickedElement, tabURL: string): ClickReach {
  const isPlainLink =
    element.role === 'link' &&
    element.href !== null &&
    !element.isInForm &&
    !element.hasClickHandler;

  const hosts = [findURLHost(tabURL), findURLHost(element.href ?? '')].filter(
    (host) => host !== null,
  );

  return { isPlainLink, destinations: [...new Set(hosts)] };
}
