import type { ContractInputs } from '@heynixie/contract';
import type { JSONObject } from '@heynixie/log';

type ApprovalAnswer = ContractInputs['approvals']['answerProposal'];

// The trust fields join the hash only when set, so an answer that carries none hashes as it did
// before they existed and a retry across an upgrade still matches.
// A hash of free text alone confirms a guess at the text, so the note and an edit count as flags.
export function buildHashedInput(answer: ApprovalAnswer): JSONObject {
  return {
    proposalID: answer.proposalID,
    actionHash: answer.actionHash,
    choice: answer.choice,
    ruleHash: answer.ruleHash ?? null,
    ...(answer.trust === undefined ? {} : { trust: answer.trust }),
    ...(answer.placeHash === undefined ? {} : { placeHash: answer.placeHash }),
    ...(answer.tickedPlaces === undefined ? {} : { tickedPlaces: answer.tickedPlaces }),
    deferUntil: answer.deferUntil?.toISOString() ?? null,
    hasNote: answer.note !== undefined,
    isEdited: answer.memory?.editedText !== undefined,
    revisionOf: answer.memory?.revisionOf?.itemID ?? null,
    ignoreCloseMatch: answer.memory?.ignoreCloseMatch ?? null,
  };
}
