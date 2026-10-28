import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';
import type { MomentDetail } from '../types';
import { useMomentEdit } from '../use-moment-edit';

export interface MomentLinksProps {
  readonly moment: MomentDetail;
}

const section = css({ marginBlock: '4' });
const heading = css({ fontSize: 'lg', fontWeight: 'semibold' });
const quiet = css({ color: 'textMuted', fontSize: 'sm' });
const link = css({ color: 'link', textDecoration: 'underline' });
const list = css({ display: 'flex', flexDirection: 'column', gap: '2', marginBlock: '2' });

export function MomentLinks(props: MomentLinksProps): ReactNode {
  const moment = props.moment;
  const [itemID, setItemID] = useState('');

  const edit = useMomentEdit(moment.momentID, () => {
    setItemID('');
  });

  return (
    <section aria-label="Linked memory" className={section}>
      <h2 className={heading}>Linked memory</h2>
      {moment.links.length === 0 ? (
        <p className={quiet}>No memory item links to this moment.</p>
      ) : (
        <ul className={list}>
          {moment.links.map((linked) => (
            <li aria-label={linked.shortID} key={linked.itemID}>
              <a className={link} href={`/memory?item=${linked.itemID}`}>
                {linked.shortID}
              </a>
              : {linked.text ?? 'Text unreadable'}{' '}
              <button
                disabled={edit.isPending}
                onClick={() => {
                  edit.send({
                    change: { kind: 'link', itemID: linked.itemID, isLinked: false },
                    version: moment.version,
                  });
                }}
                type="button"
              >
                Remove the link
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className={css({ alignItems: 'center', display: 'flex', gap: '2' })}
        onSubmit={(event) => {
          event.preventDefault();

          const named = itemID.trim();

          if (named !== '') {
            edit.send({
              change: { kind: 'link', itemID: named, isLinked: true },
              version: moment.version,
            });
          }
        }}
      >
        <label className={css({ display: 'flex', gap: '2' })}>
          Memory item ID
          <input
            className={css({ borderWidth: '1px', paddingInline: '2' })}
            maxLength={200}
            onChange={(event) => {
              setItemID(event.target.value);
            }}
            value={itemID}
          />
        </label>
        <button disabled={edit.isPending || itemID.trim() === ''} type="submit">
          Link the item
        </button>
      </form>
      {edit.notice === null ? null : <p role="alert">{edit.notice}</p>}
    </section>
  );
}
