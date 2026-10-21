export type CheckerVerdict = 'asserted' | 'not_asserted' | 'unsure';

export interface CheckerRequest {
  readonly prompt: string;
  readonly input: string;
}

export interface CheckerAnswer {
  readonly verdict: CheckerVerdict;
  readonly reason: string;
  readonly model: string;
  readonly failure: 'timeout' | 'error' | 'unreadable' | null;
}

export type RunCheck = (request: CheckerRequest) => Promise<CheckerAnswer>;
