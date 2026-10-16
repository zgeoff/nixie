/* oxlint-disable one-var -- the page keeps its state in separate bindings */
// Runs in the page: follows a textarea through beforeinput and input with the shipped span logic,
// the way the web client's composer does, and logs each event. Served by device.ts, it posts each
// log entry to the server.
import { buildPendingInput } from '../../libs/contract/src/build-pending-input.ts';
import { buildSpanState } from '../../libs/contract/src/build-span-state.ts';
import type { PendingInput, SpanState } from '../../libs/contract/src/types.ts';

interface LogEntry {
  data: string | null;
  event: string;
  inputType?: string;
  isComposing?: boolean;
  key?: string;
  keyCode?: number;
  pendingSource?: string;
  selection?: [number, number];
  targetRanges?: [number, number][];
  time?: number;
  value?: string;
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
const query = new URLSearchParams(location.search);
let caseName = query.get('case') ?? 'none';
let copyText = query.get('copy') ?? 'COPIED';
const log: LogEntry[] = [];
let pending: PendingInput | undefined;
let state: SpanState = { spans: [], text: '' };

if (area) {
  area.addEventListener('beforeinput', (event) => {
    pending = buildPendingInput({
      data: event.data,
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
      targetRanges: event
        .getTargetRanges()
        .map((range): [number, number] => [range.startOffset, range.endOffset]),
      time: Math.round(event.timeStamp),
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
      time: Math.round(inputEvent.timeStamp),
      value: area.value,
    });
  });
  for (const name of ['keydown', 'keyup']) {
    area.addEventListener(name, (event) => {
      const key = event as KeyboardEvent;
      writeEntry({
        data: null,
        event: name,
        key: key.key,
        keyCode: key.keyCode,
        time: Math.round(key.timeStamp),
      });
    });
  }
  area.addEventListener('paste', () => {
    writeEntry({ data: null, event: 'paste' });
  });
  for (const name of ['compositionstart', 'compositionupdate', 'compositionend']) {
    area.addEventListener(name, (event) => {
      writeEntry({ data: (event as CompositionEvent).data, event: name });
    });
  }
}

document.querySelector('#copy')?.addEventListener('click', () => {
  void navigator.clipboard.writeText(copyText);
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

// With ?guided, the page walks through the phone cases in order: each shows what to do, and the
// next button clears the text box and starts the next case.
interface GuidedCase {
  readonly name: string;
  readonly step: string;
}

const guidedCases: readonly GuidedCase[] = [
  { name: 'typing', step: 'Type "the blue kettle is warm" key by key. Tap no suggestion.' },
  {
    name: 'completion',
    step: 'Type "kett", tap "kettle" in the strip. Type "wa", tap "warm" in the strip.',
  },
  {
    name: 'prediction',
    step: 'Type "Good " then tap the middle suggestion 3 times in a row.',
  },
  {
    name: 'phrase',
    step: 'Type "Thank you for". Accept any suggestion of 2 or more words: tap it in the strip, or the grey text after the cursor. Then try "Happy birth" and "See you".',
  },
  {
    name: 'correction',
    step: 'Type "the kettel is warm ". Then tap the word "kettel" and pick "kettle" from the strip.',
  },
  {
    name: 'natural',
    step: 'Type "Remember that the garden gate sticks in winter" the way you would type a message, suggestions and all.',
  },
  { name: 'long-press', step: 'Tap copy. Long-press the text box and tap Paste.' },
  { name: 'chip', step: 'Tap copy. Tap the clipboard suggestion in the keyboard strip.' },
  { name: 'voice', step: 'Tap the microphone on the keyboard and say "the garden gate sticks".' },
];

const stepView = document.querySelector('#step');
let guidedIndex = -1;

function startNextCase(): void {
  guidedIndex += 1;
  const next = guidedCases[guidedIndex];
  if (next === undefined) {
    if (stepView) {
      stepView.textContent = 'Done. Thank you.';
    }
    return;
  }
  caseName = next.name;
  copyText = `${next.name} test words`;
  pending = undefined;
  state = { spans: [], text: '' };
  if (area) {
    area.value = '';
  }
  if (stepView) {
    stepView.textContent = `${guidedIndex + 1}/${guidedCases.length} ${next.name}: ${next.step}`;
  }
}

if (query.has('guided')) {
  document.querySelector('#next')?.addEventListener('click', startNextCase);
  startNextCase();
}
