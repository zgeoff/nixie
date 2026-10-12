import { onTestFinished } from 'bun:test';

export interface StubResizeObserver {
  // tells every observer that watches the element that its size changed
  readonly resize: (target: Element) => void;
}

// happy-dom's ResizeObserver never calls back, because happy-dom lays nothing out. This stand-in
// replaces it for one test: an observer calls back when the test resizes an element it watches,
// and stops once it disconnects or unobserves that element.
export function registerStubResizeObserver(): StubResizeObserver {
  const original = globalThis.ResizeObserver;
  const observers = new Set<StubObserver>();

  // the DOM names the observer's methods, so they are fields that keep those names
  class StubObserver implements ResizeObserver {
    readonly targets = new Set<Element>();
    readonly #onResize: ResizeObserverCallback;

    constructor(onResize: ResizeObserverCallback) {
      this.#onResize = onResize;
      observers.add(this);
    }

    readonly observe = (target: Element): void => {
      this.targets.add(target);
    };

    readonly unobserve = (target: Element): void => {
      this.targets.delete(target);
    };

    readonly disconnect = (): void => {
      this.targets.clear();
    };

    emitResize(target: Element): void {
      this.#onResize([{ target } as ResizeObserverEntry], this);
    }
  }

  globalThis.ResizeObserver = StubObserver;
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
