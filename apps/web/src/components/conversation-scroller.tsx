import type { ReactNode, RefObject } from 'react';
import { useLayoutEffect, useRef } from 'react';
import { css } from '../styled-system/css';

export interface ConversationScrollerProps {
  readonly children: ReactNode;

  readonly arrivals: number;

  readonly sends: number;
}

export function ConversationScroller(props: ConversationScrollerProps): ReactNode {
  const scrollerRef = useRef<HTMLDivElement>(null);
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

  useFollowOnResize(scrollerRef, isFollowing);

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

function useFollowOnResize(
  scrollerRef: RefObject<HTMLDivElement | null>,
  isFollowing: RefObject<boolean>,
): void {
  useLayoutEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const scroller = entries[0]?.target;

      if (scroller !== undefined && isFollowing.current) {
        scroller.scrollTop = scroller.scrollHeight;
      }
    });

    if (scrollerRef.current !== null) {
      observer.observe(scrollerRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [isFollowing, scrollerRef]);
}

const nearEnd = 48;

interface ScrollPosition {
  readonly clientHeight: number;
  readonly scrollHeight: number;
  readonly scrollTop: number;
}

function isNearEnd(element: ScrollPosition): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= nearEnd;
}
