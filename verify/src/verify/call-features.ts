import { featurePaths } from './feature-paths';

// The features that run a call on the fake speech layer, which the registry lists after the coding
// session.
export const callFeatures = [
  {
    name: 'call-hand-off',
    summary: 'Hand one question off in a call, and hear the holding line and the answer',
    paths: featurePaths['call-hand-off'],
  },
];

// what the call-step action does with each step
export const callStepSummary =
  'Play one step of a call on the fake speech layer: --step start starts a call and connects it, --step hand-off has the speech layer hand off one question, whose model reply waits, --step hold moves the clock past the hold time and waits for the holding line, --step release lets the reply go, --step hang-up hangs the call up, and --step read changes nothing. Each step returns the call ID and every call that nixie made on the speech layer';
