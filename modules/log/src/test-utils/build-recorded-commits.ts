export interface RecordedCommits {
  readonly commits: EventTarget;

  readonly calls: readonly string[];
}

export function buildRecordedCommits(): RecordedCommits {
  const target = new EventTarget();

  const calls: string[] = [];

  return {
    commits: {
      addEventListener: (type, listener, options) => {
        calls.push(`add ${type}`);
        target.addEventListener(type, listener, options);
      },
      removeEventListener: (type, listener, options) => {
        calls.push(`remove ${type}`);
        target.removeEventListener(type, listener, options);
      },
      dispatchEvent: (event) => target.dispatchEvent(event),
    },
    calls,
  };
}
