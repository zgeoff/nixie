import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useIsHydrated } from '../conversation/use-is-hydrated';
import type { RuleDraft } from '../rule/rule-draft';
import { buildEmptyRuleDraft, toRuleForm } from '../rule/rule-draft';
import { RuleForm } from '../rule/rule-form';
import { css } from '../styled-system/css';
import { toMandateExpiry } from './to-mandate-expiry';
import { useProposeMandate } from './use-propose-mandate';

const form = css({ maxWidth: 'md' });

const controls = css({
  border: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: '2',
  margin: '0',
  minWidth: '0',
  padding: '0',
});

const field = css({ display: 'flex', flexDirection: 'column', fontSize: 'sm', gap: '1' });

// A mandate of 1 to 10 allow rules. It ends at the time you pick, or at midnight by default, and
// it starts only once you approve it on the approvals page. The controls wait for hydration,
// because text typed into the server render is lost.
export function MandateForm(): ReactNode {
  const proposer = useProposeMandate();
  const isHydrated = useIsHydrated();
  const [title, setTitle] = useState('');
  const [expires, setExpires] = useState('');
  const [drafts, setDrafts] = useState<readonly RuleDraft[]>([buildEmptyRuleDraft()]);

  return (
    <form
      aria-label="Propose a mandate"
      className={form}
      onSubmit={(event) => {
        event.preventDefault();

        proposer.propose({
          title: title.trim(),
          rules: drafts.map((draft) => toRuleForm(draft)),
          expires: toMandateExpiry(expires),
        });
      }}
    >
      <fieldset className={controls} disabled={!isHydrated}>
        <label className={field}>
          Title
          <input
            maxLength={120}
            onChange={(event) => {
              setTitle(event.target.value);
            }}
            value={title}
          />
        </label>
        <label className={field}>
          Ends (optional, at midnight by default)
          <input
            onChange={(event) => {
              setExpires(event.target.value);
            }}
            type="datetime-local"
            value={expires}
          />
        </label>
        {drafts.map((draft, index) => (
          <div key={index}>
            <RuleForm
              draft={draft}
              label={`Rule ${index + 1}`}
              onDraft={(next) => {
                setDrafts(drafts.map((held, at) => (at === index ? next : held)));
              }}
            />
            {drafts.length > 1 ? (
              <button
                onClick={() => {
                  setDrafts(drafts.filter((_held, at) => at !== index));
                }}
                type="button"
              >
                Remove rule {index + 1}
              </button>
            ) : null}
          </div>
        ))}
        {drafts.length < 10 ? (
          <button
            onClick={() => {
              setDrafts([...drafts, buildEmptyRuleDraft()]);
            }}
            type="button"
          >
            Add a rule
          </button>
        ) : null}
        <button disabled={proposer.isPending} name="propose" type="submit">
          Propose the mandate
        </button>
      </fieldset>
      {proposer.faults.length === 0 ? null : (
        <ul role="alert">
          {proposer.faults.map((fault) => (
            <li key={fault}>{fault}</li>
          ))}
        </ul>
      )}
      {proposer.proposedUntil === null ? null : (
        <p role="status">
          The mandate is proposed. <Link to="/proposals">Approve it</Link> to start it. It ends{' '}
          {proposer.proposedUntil.toLocaleString()}.
        </p>
      )}
    </form>
  );
}
