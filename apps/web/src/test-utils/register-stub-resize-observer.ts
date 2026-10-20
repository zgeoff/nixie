import { onTestFinished } from 'bun:test';

export interface StubResizeObserver {
  // tells every observer that watches the element that its size changed
  readonly resize: (target: Element) => void;
}

interface StubObserver extends ResizeObserver {
  readonly targets: Set<Element>;
  readonly emitResize: (target: Element) => void;
}

// happy-dom's ResizeObserver never calls back, because happy-dom lays nothing out. This stand-in
// replaces it for one test: an observer calls back when the test resizes an element it watches,
// and stops once it disconnects or unobserves that element.
export function registerStubResizeObserver(): StubResizeObserver {
  const original = globalThis.ResizeObserver;

  const observers = new Set<StubObserver>();

  // Code under test builds an observer with `new`, which a bound plain function answers with the
  // object it returns.
  Reflect.set(globalThis, 'ResizeObserver', createStubObserver.bind(null, observers));

  onTestFinished(() => {
    globalThis.ResizeObserver = original;
  });

  return {
    resize: (target) => {
      for (const observer of observers) {
        if (observer.targets.has(target)) {
          observer.emitResize(target);
        }
      }
    },
  };
}

// The DOM names the observer's methods, so they are fields that keep those names.
function createStubObserver(
  observers: Set<StubObserver>,
  onResize: ResizeObserverCallback,
): StubObserver {
  const targets = new Set<Element>();

  const observer: StubObserver = {
    targets,
    observe: (target) => {
      targets.add(target);
    },
    unobserve: (target) => {
      targets.delete(target);
    },
    disconnect: () => {
      targets.clear();
    },
    emitResize: (target) => {
      onResize([buildResizeEntry(target)], observer);
    },
  };

  observers.add(observer);

  return observer;
}

// An entry with the element's current box, so an observer that reads the size sees the one the
// test laid out.
function buildResizeEntry(target: Element): ResizeObserverEntry {
  const rect = target.getBoundingClientRect();
  const size = [{ blockSize: rect.height, inlineSize: rect.width }];

  return {
    borderBoxSize: size,
    contentBoxSize: size,
    contentRect: rect,
    devicePixelContentBoxSize: size,
    target,
  };
}
