/* oxlint-disable one-var -- the page keeps its state in separate bindings */
// Runs in the page: follows a textarea through beforeinput and input with the shipped span logic,
// the way the web client's composer does, and logs each event. Served by device.ts, it posts each
// log entry to the server.
import { buildPendingInput } from '../../../../../libs/contract/src/build-pending-input.ts';
import { buildSpanState } from '../../../../../libs/contract/src/build-span-state.ts';
import type { PendingInput, SpanState } from '../../../../../libs/contract/src/types.ts';

interface LogEntry {
  data: string | null;
  event: string;
  inputType?: string;
  isComposing?: boolean;
  pendingSource?: string;
  selection?: [number, number];
  spans?: string[];
}

interface PageState {
  inputTypes: string[];
  log: LogEntry[];
  spans: string[];
  text: string;
}

declare global {
  var readState: () => PageState;
}

const area = document.querySelector('textarea');
const view = document.querySelector('#log');
const caseName = new URLSearchParams(location.search).get('case') ?? 'none';
const log: LogEntry[] = [];
let pending: PendingInput | undefined;
let state: SpanState = { spans: [], text: '' };

if (area) {
  area.addEventListener('beforeinput', (event) => {
    pending = buildPendingInput({
      inputType: event.inputType,
      selectionEnd: area.selectionEnd,
      selectionStart: area.selectionStart,
    });
    writeEntry({
      data: event.data,
      event: 'beforeinput',
      inputType: event.inputType,
      isComposing: event.isComposing,
      pendingSource: pending.source,
      selection: [area.selectionStart, area.selectionEnd],
    });
  });
  area.addEventListener('input', (event) => {
    const inputEvent = event as InputEvent;
    // The composer reads the pending input once and clears it, so an input event with no
    // beforeinput before it falls back to unknown.
    const used = pending;
    pending = undefined;
    state = buildSpanState(state, used, area.value);
    writeEntry({
      data: inputEvent.data,
      event: 'input',
      inputType: inputEvent.inputType,
      pendingSource: used?.source ?? 'none',
      spans: formatSpans(state),
    });
  });
  for (const name of ['compositionstart', 'compositionend']) {
    area.addEventListener(name, (event) => {
      writeEntry({ data: (event as CompositionEvent).data, event: name });
    });
  }
}

document.querySelector('#copy')?.addEventListener('click', () => {
  const text = new URLSearchParams(location.search).get('copy') ?? 'COPIED';
  void navigator.clipboard.writeText(text);
});

function writeEntry(entry: LogEntry): void {
  log.push(entry);
  const sequence = log.length;
  if (view) {
    view.textContent = log.map((line) => JSON.stringify(line)).join('\n');
  }
  if (location.protocol === 'http:') {
    void fetch('/log', { body: JSON.stringify({ case: caseName, sequence, ...entry }), method: 'POST' });
  }
}

function formatSpans(current: SpanState): string[] {
  return current.spans.map(
    (span) => `${span.source}:${JSON.stringify(current.text.slice(span.start, span.end))}`,
  );
}

function readPageState(): PageState {
  return {
    inputTypes: log.filter((entry) => entry.event === 'input').map((entry) => entry.inputType ?? ''),
    log,
    spans: formatSpans(state),
    text: state.text,
  };
}

globalThis.readState = readPageState;
