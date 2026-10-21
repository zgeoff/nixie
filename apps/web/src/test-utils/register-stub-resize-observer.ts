import { onTestFinished } from 'bun:test';

export interface StubResizeObserver {
  readonly resize: (target: Element) => void;
}

interface StubObserver extends ResizeObserver {
  readonly targets: Set<Element>;
  readonly emitResize: (target: Element) => void;
}

// happy-dom's ResizeObserver never calls back, because happy-dom lays nothing out.
export function registerStubResizeObserver(): StubResizeObserver {
  const original = globalThis.ResizeObserver;

  const observers = new Set<StubObserver>();

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
