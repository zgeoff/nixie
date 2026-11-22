import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import type { Note, NoteLink } from '../types';

export interface NoteLinksProps {
  readonly links: Note['links'];
  readonly backlinks: Note['backlinks'];
  readonly showPrivate: boolean;
}

const section = css({ display: 'flex', flexDirection: 'column', gap: '2' });

const list = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '1',
  listStyleType: 'disc',
  paddingInlineStart: '5',
});

const muted = css({ color: 'textMuted', fontSize: 'sm' });
const link = css({ color: 'link', textDecoration: 'underline' });

const typeLabels = {
  supersedes: 'Supersedes',
  disputes: 'Disputes',
  'part-of': 'Part of',
  cites: 'Cites',
  related: 'Related to',
} as const;

const typeOrder = ['supersedes', 'disputes', 'part-of', 'cites', 'related'] as const;

export function NoteLinks(props: NoteLinksProps): ReactNode {
  const search = props.showPrivate ? { private: 1 as const } : {};

  return (
    <>
      <section aria-label="Links" className={section}>
        <h2>Links</h2>
        {props.links.length === 0 ? <p className={muted}>This note links to nothing.</p> : null}
        {typeOrder.map((type) => {
          const ofType = props.links.filter((entry) => entry.type === type);

          return ofType.length === 0 ? null : (
            <div key={type}>
              <h3>{typeLabels[type]}</h3>
              <ul className={list}>
                {ofType.map((entry) => (
                  <li key={`${entry.kind}:${entry.target}`}>
                    <LinkTarget link={entry} search={search} />
                    {entry.reason === null ? null : (
                      <span className={muted}> — {entry.reason}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>
      <section aria-label="Backlinks" className={section}>
        <h2>Backlinks</h2>
        {props.backlinks.length === 0 ? <p className={muted}>No note links here.</p> : null}
        <ul className={list}>
          {props.backlinks.map((entry) => (
            <li key={`${entry.from}:${entry.type}`}>
              <span className={muted}>{typeLabels[entry.type]} this: </span>
              <Link
                className={link}
                params={{ note: entry.from }}
                search={search}
                to="/notebook/$note"
              >
                {entry.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

interface LinkTargetProps {
  readonly link: NoteLink;
  readonly search: { readonly private?: 1 };
}

function LinkTarget(props: LinkTargetProps): ReactNode {
  const target = props.link;
  const label = target.label ?? target.target;

  if (target.isGone) {
    return <span className={muted}>Gone ({target.kind})</span>;
  }

  if (target.kind === 'note') {
    return (
      <Link
        className={link}
        params={{ note: target.target }}
        search={props.search}
        to="/notebook/$note"
      >
        {label}
      </Link>
    );
  }

  if (target.kind === 'memory') {
    return (
      <Link className={link} search={{ item: target.target }} to="/memory">
        {label}
      </Link>
    );
  }

  if (target.kind === 'moment') {
    return (
      <a className={link} href={`/moments/${target.target}`}>
        {label}
      </a>
    );
  }

  return (
    <span>
      Event {target.target}
      {target.event === null ? null : (
        <span className={muted}>
          {' '}
          ({target.event.role}, {target.event.at.toLocaleString()})
        </span>
      )}
      {target.label === null || target.label === '' ? null : (
        <span className={muted}>: {target.label}</span>
      )}
    </span>
  );
}
