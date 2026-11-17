import type { ReactNode, RefObject } from 'react';
import { useLayoutEffect, useRef } from 'react';
import { css } from '../styled-system/css';

export interface ConversationScrollerProps {
  readonly children: ReactNode;

  readonly arrivals: number;

  readonly sends: number;

  readonly startKey?: number | undefined;

  readonly onEarlierWanted?: ((isWanted: boolean) => void) | undefined;
}

export function ConversationScroller(props: ConversationScrollerProps): ReactNode {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const isFollowing = useRef(true);
  const lastHeight = useRef(0);
  const onEarlierWanted = props.onEarlierWanted;

  useLayoutEffect(() => {
    isFollowing.current = true;
  }, [props.sends]);

  // Records that arrive before the first one shown push the view down, so the view keeps the
  // record it was on. The view's own top then stays clear of the start of the thread only when the
  // thread has no more to load.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;

    if (scroller !== null && !isFollowing.current) {
      scroller.scrollTop += scroller.scrollHeight - lastHeight.current;
    }
  }, [props.startKey]);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;

    if (scroller !== null && isFollowing.current) {
      scroller.scrollTop = scroller.scrollHeight;
    }

    if (scroller !== null) {
      lastHeight.current = scroller.scrollHeight;
      onEarlierWanted?.(isNearStart(scroller));
    }
  }, [onEarlierWanted, props.arrivals, props.sends, props.startKey]);

  useFollowOnResize(scrollerRef, isFollowing, lastHeight, onEarlierWanted);

  return (
    <div
      className={css({ flex: '1', minWidth: '0', overflowY: 'auto' })}
      onScroll={(event) => {
        isFollowing.current = isNearEnd(event.currentTarget);
        lastHeight.current = event.currentTarget.scrollHeight;
        onEarlierWanted?.(isNearStart(event.currentTarget));
      }}
      ref={scrollerRef}
    >
      {props.children}
    </div>
  );
}

const nearStart = 200;

interface ScrollPosition {
  readonly clientHeight: number;
  readonly scrollHeight: number;
  readonly scrollTop: number;
}

function isNearStart(element: ScrollPosition): boolean {
  return element.scrollTop <= nearStart;
}

function useFollowOnResize(
  scrollerRef: RefObject<HTMLDivElement | null>,
  isFollowing: RefObject<boolean>,
  lastHeight: RefObject<number>,
  onEarlierWanted: ((isWanted: boolean) => void) | undefined,
): void {
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;

    const observer = new ResizeObserver(() => {
      if (scroller === null) {
        return;
      }

      if (isFollowing.current) {
        scroller.scrollTop = scroller.scrollHeight;
      }

      lastHeight.current = scroller.scrollHeight;
      onEarlierWanted?.(isNearStart(scroller));
    });

    if (scroller !== null) {
      // The list grows without the scroller's own box changing, so the observer watches the list.
      observer.observe(scroller);

      for (const child of scroller.children) {
        observer.observe(child);
      }
    }

    return () => {
      observer.disconnect();
    };
  }, [isFollowing, lastHeight, onEarlierWanted, scrollerRef]);
}

const nearEnd = 48;

function isNearEnd(element: ScrollPosition): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= nearEnd;
}
