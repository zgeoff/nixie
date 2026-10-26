import { createHash } from 'node:crypto';
import { renderLabellerInput } from './render-labeller-input.ts';
import type { LabelTurn } from './types.ts';

// A rebuild of the cases can keep a turn's step and change its messages, its calls or the exchanges
// before it, so a saved label counts only while the input it judged is the input the turn gives now.
export function buildLabelFingerprint(turn: LabelTurn): string {
  return createHash('sha256').update(renderLabellerInput(turn)).digest('hex');
}
