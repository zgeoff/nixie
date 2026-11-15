import type { ReactNode } from 'react';
import type { RuleDraft } from '../rule/rule-draft';
import { toRuleForm } from '../rule/rule-draft';
import { RuleForm } from '../rule/rule-form';
import { useEditProposedRule } from '../rule/use-edit-proposed-rule';
import type { ApprovalRead } from '../types';

export interface ApprovalRuleEditorProps {
  readonly item: ApprovalRead;
  readonly draft: RuleDraft;
  readonly onDraft: (draft: RuleDraft) => void;

  // called once the host took the edit, so the card reads its row again
  readonly onEdited: () => void;
}

// The edit of a proposed rule. Saving withdraws this card and opens a new one with the edited rule,
// which the owner then approves.
export function ApprovalRuleEditor(props: ApprovalRuleEditorProps): ReactNode {
  const editor = useEditProposedRule({ onEdited: props.onEdited });
  const proposal = props.item.proposal;

  return (
    <div aria-label="Edit the proposed rule" role="group">
      <RuleForm draft={props.draft} label="The proposed rule" onDraft={props.onDraft} />
      {editor.faults.length === 0 ? null : (
        <ul role="alert">
          {editor.faults.map((fault) => (
            <li key={fault}>{fault}</li>
          ))}
        </ul>
      )}
      <button
        disabled={editor.isPending}
        name="save-rule"
        onClick={() => {
          editor.edit({
            proposalID: proposal.proposalID,
            actionHash: proposal.actionHash,
            rule: toRuleForm(props.draft),
          });
        }}
        type="button"
      >
        Save as a new proposal
      </button>
    </div>
  );
}
