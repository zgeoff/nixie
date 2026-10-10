/* oxlint-disable one-var -- the page keeps its state in separate bindings */
// Runs in the page: follows a textarea through beforeinput and input, and keeps its spans.
import type { Selection, Span } from './spans.ts';
import { applyEdit, findEdit, getSourceForInputType, getSpanText } from './spans.ts';

interface PageState {
  inputTypes: string[];
  spans: string[];
  text: string;
}

declare global {
  var readState: () => PageState;
}

const area = document.querySelector('textarea');
const inputTypes: string[] = [];
let selection: Selection = { backward: false, end: 0, start: 0 };
let spans: Span[] = [];
let text = '';

if (area) {
  area.addEventListener('beforeinput', (event) => {
    selection = {
      backward: (event as InputEvent).inputType.endsWith('Backward'),
      end: area.selectionEnd,
      start: area.selectionStart,
    };
  });
  area.addEventListener('input', (event) => {
    const inputType = (event as InputEvent).inputType;
    inputTypes.push(inputType);
    spans = applyEdit(
      spans,
      findEdit(text, area.value, selection),
      getSourceForInputType(inputType),
    );
    text = area.value;
  });
}

function readPageState(): PageState {
  return { inputTypes, spans: getSpanText(text, spans), text };
}

globalThis.readState = readPageState;
