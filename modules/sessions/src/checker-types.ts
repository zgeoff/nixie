// A checker's verdict on one question. Only asserted lets the gate that asked go ahead.
export type CheckerVerdict = 'asserted' | 'not_asserted' | 'unsure';

// One question for the checker: its system prompt, and the input the gate built for it.
export interface CheckerRequest {
  readonly prompt: string;
  readonly input: string;
}

// The checker's answer, with the model that gave it. A timeout, an error or an unreadable answer
// reads as unsure, with failure saying which.
export interface CheckerAnswer {
  readonly verdict: CheckerVerdict;
  readonly reason: string;
  readonly model: string;
  readonly failure: 'timeout' | 'error' | 'unreadable' | null;
}

// Asks the checker one question. It never rejects: a failure answers unsure.
export type RunCheck = (request: CheckerRequest) => Promise<CheckerAnswer>;
