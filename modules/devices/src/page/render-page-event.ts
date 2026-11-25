import type { PageData } from '@heynixie/contract';
import { mintBlockID, renderFenced } from '@heynixie/wire';

export interface RenderedPageEvent {
  readonly deviceName: string;
  readonly region: string;
  readonly name: string;

  // null once a forget removed the page's data, or when the page sent none
  readonly data: PageData | null;
}

// What the assistant reads of a page event: the line that says where it came from, then the
// page's own text inside the markers that a page read shows. The name and the data are written as
// JSON, which escapes every quote, so no page can write a closing marker.
export function renderPageEvent(
  event: RenderedPageEvent,
  mint: () => string = mintBlockID,
): readonly string[] {
  const text = JSON.stringify({
    name: event.name,
    ...(event.data === null ? {} : { data: event.data }),
  });

  return [
    `a page event from ${event.deviceName}, region ${event.region}`,
    ...renderFenced({
      tag: 'tool-result',
      attributes: { source: 'untrusted' },
      text,
      fence: mint(),
    }).split('\n'),
  ];
}
