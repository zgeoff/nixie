import type { ReactNode } from 'react';
import { useLayoutEffect, useRef } from 'react';
import { css } from '../styled-system/css';

export interface ConversationScrollerProps {
  readonly children: ReactNode;

  // changes when a record or a message arrives
  readonly arrivals: number;

  // changes when you send a message
  readonly sends: number;
}

// The scrolling part of the conversation. An arrival brings the view to its end when it was at or
// near the end, and leaves it in place when you scrolled up to read. Your own message always
// brings the view to its end.
export function ConversationScroller(props: ConversationScrollerProps): ReactNode {
  const scrollerRef = useRef<HTMLDivElement>(null);

  // whether the view was at its end when you last scrolled; it starts true, so the conversation
  // opens at its end
  const isFollowing = useRef(true);

  useLayoutEffect(() => {
    isFollowing.current = true;
  }, [props.sends]);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;

    if (scroller !== null && isFollowing.current) {
      scroller.scrollTop = scroller.scrollHeight;
    }
  }, [props.arrivals, props.sends]);

  return (
    <div
      className={css({ flex: '1', overflowY: 'auto' })}
      onScroll={(event) => {
        isFollowing.current = isNearEnd(event.currentTarget);
      }}
      ref={scrollerRef}
    >
      {props.children}
    </div>
  );
}

// How close to the end, in pixels, still counts as at the end, so a stray pixel of scroll does
// not stop the view following.
const nearEnd = 48;

function isNearEnd(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= nearEnd;
}
