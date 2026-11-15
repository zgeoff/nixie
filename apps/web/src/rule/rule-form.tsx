import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import type { CheckDraft, RuleDraft } from './rule-draft';
import { checkOperations, ruleContextChoices, ruleSourceChoices } from './rule-draft';

export interface RuleFormProps {
  readonly draft: RuleDraft;
  readonly onDraft: (draft: RuleDraft) => void;

  // the label of the group, so a page with several forms names each
  readonly label: string;
}

const form = css({ display: 'flex', flexDirection: 'column', gap: '2', maxWidth: 'md' });
const field = css({ display: 'flex', flexDirection: 'column', fontSize: 'sm', gap: '1' });
const choiceRow = css({ display: 'flex', flexWrap: 'wrap', gap: '3', fontSize: 'sm' });
const checkRow = css({ display: 'flex', flexWrap: 'wrap', gap: '2' });

// The editable fields of one allow rule. The outcome is fixed: a proposal only ever allows.
export function RuleForm(props: RuleFormProps): ReactNode {
  const draft = props.draft;

  const setText = (key: 'tools' | 'effects' | 'definitions' | 'destinations', value: string) => {
    props.onDraft({ ...draft, [key]: value });
  };

  const toggle = (key: 'contexts' | 'sources', choice: string) => {
    const held = draft[key];

    props.onDraft({
      ...draft,
      [key]: held.includes(choice) ? held.filter((entry) => entry !== choice) : [...held, choice],
    });
  };

  const setCheck = (index: number, next: CheckDraft | null) => {
    const checks = draft.checks.flatMap((check, at) => {
      if (at !== index) {
        return [check];
      }

      return next === null ? [] : [next];
    });

    props.onDraft({ ...draft, checks });
  };

  return (
    <div aria-label={props.label} className={form} role="group">
      <p className={css({ fontSize: 'sm' })}>Outcome: allow</p>
      <label className={field}>
        Tools (one to a line)
        <textarea
          onChange={(event) => {
            setText('tools', event.target.value);
          }}
          rows={2}
          value={draft.tools}
        />
      </label>
      <fieldset className={choiceRow}>
        <legend>Contexts</legend>
        {ruleContextChoices.map((choice) => (
          <label key={choice}>
            <input
              checked={draft.contexts.includes(choice)}
              onChange={() => {
                toggle('contexts', choice);
              }}
              type="checkbox"
            />{' '}
            {choice}
          </label>
        ))}
      </fieldset>
      <label className={field}>
        Task definitions (one to a line)
        <textarea
          onChange={(event) => {
            setText('definitions', event.target.value);
          }}
          rows={2}
          value={draft.definitions}
        />
      </label>
      <label className={field}>
        Destinations (one to a line)
        <textarea
          onChange={(event) => {
            setText('destinations', event.target.value);
          }}
          rows={2}
          value={draft.destinations}
        />
      </label>
      <fieldset className={choiceRow}>
        <legend>Sources</legend>
        {ruleSourceChoices.map((choice) => (
          <label key={choice}>
            <input
              checked={draft.sources.includes(choice)}
              onChange={() => {
                toggle('sources', choice);
              }}
              type="checkbox"
            />{' '}
            {choice}
          </label>
        ))}
      </fieldset>
      <label className={field}>
        Effects it lets through (one to a line)
        <textarea
          onChange={(event) => {
            setText('effects', event.target.value);
          }}
          rows={1}
          value={draft.effects}
        />
      </label>
      <fieldset className={form}>
        <legend>Argument checks</legend>
        {draft.checks.map((check, index) => (
          <div className={checkRow} key={index} role="group">
            <input
              aria-label={`Check ${index + 1} argument`}
              onChange={(event) => {
                setCheck(index, { ...check, arg: event.target.value });
              }}
              value={check.arg}
            />
            <select
              aria-label={`Check ${index + 1} operator`}
              onChange={(event) => {
                const op = checkOperations.find((entry) => entry === event.target.value);

                setCheck(index, { ...check, op: op ?? check.op });
              }}
              value={check.op}
            >
              {checkOperations.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
            <textarea
              aria-label={`Check ${index + 1} value`}
              onChange={(event) => {
                setCheck(index, { ...check, value: event.target.value });
              }}
              rows={1}
              value={check.value}
            />
            <button
              onClick={() => {
                setCheck(index, null);
              }}
              type="button"
            >
              Remove check
            </button>
          </div>
        ))}
        <button
          onClick={() => {
            props.onDraft({
              ...draft,
              checks: [...draft.checks, { arg: '', op: 'eq', value: '' }],
            });
          }}
          type="button"
        >
          Add a check
        </button>
      </fieldset>
    </div>
  );
}
