import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import type { NoteCheck } from '../types';
import { isUnauthorizedError } from '../utils/is-unauthorized-error';
import { useNixieClient } from '../utils/use-nixie-client';
import { EnrolForm } from './enrol-form';

export interface NotebookCheckViewProps {
  readonly showPrivate: boolean;
  readonly onShowPrivateChange: (showPrivate: boolean) => void;
}

const page = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '4',
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingBlock: '4',
  paddingInline: '4',
});

const muted = css({ color: 'textMuted', fontSize: 'sm' });
const link = css({ color: 'link', textDecoration: 'underline' });

// What the assistant can fix in its notebook: notes nothing links to, links whose target is gone,
// and a reason repeated on many links.
export function NotebookCheckView(props: NotebookCheckViewProps): ReactNode {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();

  const check = useQuery({
    ...nixie.queryUtils.notebook.readCheck.queryOptions({
      input: props.showPrivate ? { showPrivate: true } : {},
    }),
    retry: false,
  });

  if (isUnauthorizedError(check.error)) {
    return (
      <EnrolForm
        onEnrolled={() => {
          void queryClient.resetQueries({ queryKey: nixie.queryUtils.notebook.key() });
        }}
      />
    );
  }

  const search = props.showPrivate ? { private: 1 as const } : {};

  return (
    <main className={page}>
      <h1>Notebook check</h1>
      <p>
        <Link className={link} search={search} to="/notebook">
          All notes
        </Link>
      </p>
      <label>
        <input
          checked={props.showPrivate}
          onChange={(event) => {
            props.onShowPrivateChange(event.currentTarget.checked);
          }}
          type="checkbox"
        />{' '}
        Show private
      </label>
      {check.isPending ? <p className={muted}>Loading the check…</p> : null}
      {check.isError ? <p role="alert">The check can&apos;t load.</p> : null}
      {check.isSuccess ? <CheckReport check={check.data} search={search} /> : null}
    </main>
  );
}

interface CheckReportProps {
  readonly check: NoteCheck;
  readonly search: { readonly private?: 1 };
}

const list = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '1',
  listStyleType: 'disc',
  paddingInlineStart: '5',
});

function CheckReport(props: CheckReportProps): ReactNode {
  const check = props.check;

  return (
    <>
      <section aria-label="Orphans">
        <h2>Orphans ({check.orphanCount})</h2>
        {check.orphans.length === 0 ? <p className={muted}>No orphan.</p> : null}
        <ul className={list}>
          {check.orphans.map((orphan) => (
            <li key={orphan.note}>
              <NoteLinkText note={orphan.note} search={props.search} title={orphan.title} />
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Dangling links">
        <h2>Dangling links ({check.danglingCount})</h2>
        {check.dangling.length === 0 ? <p className={muted}>No dangling link.</p> : null}
        <ul className={list}>
          {check.dangling.map((entry) => (
            <li key={`${entry.from}:${entry.type}:${formatTarget(entry.to)}`}>
              <NoteLinkText note={entry.from} search={props.search} title={entry.from} />{' '}
              {entry.type} {formatTarget(entry.to)}, which is gone
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Repeated reasons">
        <h2>Repeated reasons ({check.repeatedReasonCount})</h2>
        {check.repeatedReasons.length === 0 ? <p className={muted}>No repeated reason.</p> : null}
        <ul className={list}>
          {check.repeatedReasons.map((entry) => (
            <li key={entry.reason}>
              &quot;{entry.reason}&quot; on {entry.count} links, from{' '}
              {entry.links.map((from, index) => (
                <span key={`${from.from}:${formatTarget(from.to)}`}>
                  {index === 0 ? '' : ', '}
                  <NoteLinkText note={from.from} search={props.search} title={from.from} />
                </span>
              ))}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

interface NoteLinkTextProps {
  readonly note: string;
  readonly title: string;
  readonly search: { readonly private?: 1 };
}

function NoteLinkText(props: NoteLinkTextProps): ReactNode {
  return (
    <Link className={link} params={{ note: props.note }} search={props.search} to="/notebook/$note">
      {props.title}
    </Link>
  );
}

function formatTarget(target: Readonly<Record<string, string>>): string {
  return Object.entries(target)
    .map(([kind, id]) => `${kind} ${id}`)
    .join(' ');
}
