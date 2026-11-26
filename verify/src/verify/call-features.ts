import { featurePaths } from './feature-paths';

// The features that run a call on the fake speech layer, which the registry lists after the coding
// session.
export const callFeatures = [
  {
    name: 'call-hand-off',
    summary: 'Hand one question off in a call, and hear the holding line and the answer',
    paths: featurePaths['call-hand-off'],
  },
  {
    name: 'call-screen',
    summary: 'Start a call from the call screen, see its proposal card, and hang up',
    paths: featurePaths['call-screen'],
  },
];

// what the call-step action does with each step
export const callStepSummary =
  'Play one step of a call on the fake speech layer: --step start starts a call and connects it, --step prepare queues the replies that the conversation wakes on the call take, for a call that the browser starts, --step hand-off has the speech layer hand off one question, whose model reply waits, --step hold moves the clock past the hold time and waits for the holding line, --step release lets the reply go, --step propose has the speech layer hand off one request to the call that the browser started, whose model reply proposes a memory item that waits for approval, --step hang-up hangs the call up, and --step read changes nothing. Each step returns the call ID, which is null for a call that the browser started, and every call that nixie made on the speech layer';
