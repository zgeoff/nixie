import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { routeDataStaleTimeMs } from '../conversation/read-route-session';
import { css } from '../styled-system/css';
import { useNixieClient } from '../utils/use-nixie-client';
import { useEndMandate } from './use-end-mandate';

const row = css({
  borderBottomWidth: '1px',
  display: 'flex',
  flexDirection: 'column',
  gap: '1',
  paddingBlock: '2',
});

const meta = css({ fontSize: 'sm', opacity: '0.8' });

// The mandates in force, each with its rules and its end, and an End now for each.
export function MandateList(): ReactNode {
  const nixie = useNixieClient();
  const ender = useEndMandate();

  const list = useQuery({
    ...nixie.queryUtils.rules.listMandates.queryOptions(),
    staleTime: routeDataStaleTimeMs,
  });

  if (list.isError) {
    return <p role="alert">The mandates did not load. Reload to try again.</p>;
  }

  const mandates = list.data?.mandates ?? [];

  if (list.isSuccess && mandates.length === 0) {
    return <p>No mandate is in force.</p>;
  }

  return (
    <>
      <ul aria-label="Mandates in force">
        {mandates.map((mandate) => (
          <li
            aria-label={mandate.title ?? mandate.mandateID}
            className={row}
            key={mandate.mandateID}
          >
            <span className={css({ fontWeight: 'semibold' })}>
              {mandate.title ?? 'A mandate whose title was forgotten'}
            </span>
            <ul>
              {mandate.rules.map((rule) => (
                <li key={rule.ruleID}>{rule.sentence}</li>
              ))}
            </ul>
            <span className={meta}>Ends {mandate.expires.toLocaleString()}</span>
            <button
              disabled={ender.isPending}
              name="end-now"
              onClick={() => {
                ender.end(mandate.mandateID);
              }}
              type="button"
            >
              End now
            </button>
          </li>
        ))}
      </ul>
      {ender.message === null ? null : <p role="alert">{ender.message}</p>}
    </>
  );
}
