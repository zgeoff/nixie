import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import type { Note } from '../types';

export interface NoteHistoryProps {
  readonly note: string;
  readonly history: Note['history'];
  readonly currentVersion: number;
  readonly showPrivate: boolean;
  readonly hasMore: boolean;
  readonly isLoadingMore: boolean;
  readonly onLoadMore: () => void;
}

const list = css({ display: 'flex', flexDirection: 'column', gap: '1', listStyleType: 'none' });
const muted = css({ color: 'textMuted', fontSize: 'sm' });
const link = css({ color: 'link', textDecoration: 'underline' });

export function NoteHistory(props: NoteHistoryProps): ReactNode {
  return (
    <section aria-label="History">
      <h2>History</h2>
      <ol className={list}>
        {props.history.map((entry) => (
          <li key={entry.version}>
            <Link
              aria-current={entry.version === props.currentVersion ? 'true' : undefined}
              className={link}
              params={{ note: props.note }}
              search={{
                version: entry.version,
                ...(props.showPrivate ? { private: 1 as const } : {}),
              }}
              to="/notebook/$note"
            >
              Version {entry.version}
            </Link>{' '}
            <span className={muted}>
              {entry.at.toLocaleString()} · {entry.writer} · {entry.model} · {entry.chars}{' '}
              characters
            </span>
          </li>
        ))}
      </ol>
      {props.hasMore ? (
        <button disabled={props.isLoadingMore} onClick={props.onLoadMore} type="button">
          Load older versions
        </button>
      ) : null}
    </section>
  );
}
