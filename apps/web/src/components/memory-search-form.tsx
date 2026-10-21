import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';

export interface MemorySearchFormProps {
  readonly query: string | null;
  readonly onSearch: (query: string | null) => void;
}

export function MemorySearchForm(props: MemorySearchFormProps): ReactNode {
  const [text, setText] = useState(props.query ?? '');

  return (
    <form
      className={css({ alignItems: 'center', display: 'flex', gap: '2', marginBlock: '3' })}
      onSubmit={(event) => {
        event.preventDefault();

        const query = text.trim() === '' ? null : text.trim();

        props.onSearch(query);
      }}
      role="search"
    >
      <label className={css({ display: 'flex', flex: '1', gap: '2' })}>
        Search memory
        <input
          className={css({ borderWidth: '1px', flex: '1', paddingInline: '2' })}
          maxLength={500}
          onChange={(event) => {
            setText(event.target.value);
          }}
          type="search"
          value={text}
        />
      </label>
      <button type="submit">Search</button>
      {props.query === null ? null : (
        <button
          onClick={() => {
            setText('');

            props.onSearch(null);
          }}
          type="button"
        >
          Clear
        </button>
      )}
    </form>
  );
}
