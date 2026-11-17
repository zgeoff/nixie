import { ORPCError } from '@orpc/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { RuleSentence } from '../rule/rule-sentence';
import { css } from '../styled-system/css';
import { useNixieClient } from '../utils/use-nixie-client';

interface RuleEditCall {
  readonly revision: number;
  readonly destinations: readonly string[];
}

export interface ApprovalRuleNoticeProps {
  readonly ruleID: string;
}

const row = css({ alignItems: 'baseline', display: 'flex', flexWrap: 'wrap', gap: '2' });
const field = css({ display: 'flex', flexDirection: 'column', fontSize: 'sm', gap: '1' });

// The notice after an Always allow: the rule that was added, with a way to narrow it or take it
// back. Both go through the host's checked actions, and the host takes only a change that leaves
// the rule no wider.
export function ApprovalRuleNotice(props: ApprovalRuleNoticeProps): ReactNode {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();
  const [isEditing, setEditing] = useState(false);
  const [kept, setKept] = useState<ReadonlySet<string> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isRemoved, setRemoved] = useState(false);

  const read = useQuery(
    nixie.queryUtils.rules.readRule.queryOptions({ input: { ruleID: props.ruleID } }),
  );

  const undo = useMutation({
    mutationFn: (revision: number) =>
      nixie.client.rules.removeRule({
        ruleID: props.ruleID,
        revision,
        clientActionID: crypto.randomUUID(),
      }),
    onSuccess: () => {
      setRemoved(true);
    },
    onError: (error) => {
      setNotice(formatRuleRefusal(error));
    },
  });

  const edit = useMutation({
    mutationFn: (call: RuleEditCall) =>
      nixie.client.rules.editRule({
        ruleID: props.ruleID,
        revision: call.revision,
        destinations: [...call.destinations],
        clientActionID: crypto.randomUUID(),
      }),
    onSuccess: async () => {
      setEditing(false);
      setNotice(null);

      await queryClient.invalidateQueries({ queryKey: nixie.queryUtils.rules.readRule.key() });
    },
    onError: (error) => {
      setNotice(formatRuleRefusal(error));
    },
  });

  if (isRemoved) {
    return <p role="status">Rule removed</p>;
  }

  const rule = read.data;

  if (rule === undefined) {
    return read.isError ? <p role="alert">The rule did not load.</p> : null;
  }

  const selected = kept ?? new Set(rule.destinations);

  return (
    <div aria-label="Rule added" role="status">
      <div className={row}>
        <span>
          Rule added: <RuleSentence sentence={rule.sentence} />
        </span>
        {rule.destinations.length > 1 ? (
          <button
            name="edit-rule"
            onClick={() => {
              setEditing(!isEditing);
              setKept(null);
            }}
            type="button"
          >
            Edit
          </button>
        ) : null}
        <button
          disabled={undo.isPending}
          name="undo-rule"
          onClick={() => {
            undo.mutate(rule.revision);
          }}
          type="button"
        >
          Undo
        </button>
      </div>
      {isEditing ? (
        <fieldset className={field}>
          <legend>Keep these destinations</legend>
          {rule.destinations.map((destination) => (
            <label key={destination}>
              <input
                checked={selected.has(destination)}
                onChange={(event) => {
                  const next = new Set(selected);

                  if (event.target.checked) {
                    next.add(destination);
                  } else {
                    next.delete(destination);
                  }

                  setKept(next);
                }}
                type="checkbox"
              />{' '}
              {destination}
            </label>
          ))}
          <button
            disabled={edit.isPending || selected.size === 0}
            onClick={() => {
              edit.mutate({ revision: rule.revision, destinations: [...selected] });
            }}
            type="button"
          >
            Save the rule
          </button>
        </fieldset>
      ) : null}
      {notice === null ? null : <p role="alert">{notice}</p>}
    </div>
  );
}

function formatRuleRefusal(error: unknown): string {
  if (error instanceof ORPCError && error.code === 'NOT_ALLOWED') {
    return 'That change needs a wider rule than this form makes, so nothing changed.';
  }

  if (error instanceof ORPCError && error.code === 'CONFLICT') {
    return 'The rule changed after you opened it, so nothing changed. Check it, then try again.';
  }

  if (error instanceof ORPCError && error.code === 'NOT_FOUND') {
    return 'This rule is gone.';
  }

  return 'The change did not finish. Try again.';
}
