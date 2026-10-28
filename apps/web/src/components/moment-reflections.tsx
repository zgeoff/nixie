import type { ReactNode } from 'react';
import { formatMemoryDate } from '../format-memory-date';
import { css } from '../styled-system/css';
import type { MomentDetail } from '../types';
import { useMomentEdit } from '../use-moment-edit';

export interface MomentReflectionsProps {
  readonly moment: MomentDetail;
}

const section = css({ marginBlock: '4' });
const heading = css({ fontSize: 'lg', fontWeight: 'semibold' });
const quiet = css({ color: 'textMuted', fontSize: 'sm' });
const list = css({ display: 'flex', flexDirection: 'column', gap: '3', marginBlock: '2' });

export function MomentReflections(props: MomentReflectionsProps): ReactNode {
  const moment = props.moment;
  const edit = useMomentEdit(moment.momentID);

  return (
    <section aria-label="Reflections" className={section}>
      <h2 className={heading}>Reflections</h2>
      {moment.reflections.length === 0 ? (
        <p className={quiet}>No model has reflected on this moment yet.</p>
      ) : (
        <ul className={list}>
          {moment.reflections.map((reflection) => {
            const label = `${reflection.model}, ${formatMemoryDate(reflection.writtenAt)}`;

            return (
              <li aria-label={`Reflection by ${label}`} key={reflection.reflectionID}>
                <p className={quiet}>{label}</p>
                <p className={css({ whiteSpace: 'pre-wrap' })}>
                  {reflection.text ?? 'This reflection is unreadable.'}
                </p>
                <button
                  disabled={edit.isPending}
                  onClick={() => {
                    edit.send({
                      change: { kind: 'reflection_removed', reflectionID: reflection.reflectionID },
                      version: moment.version,
                    });
                  }}
                  type="button"
                >
                  Remove this reflection
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {edit.notice === null ? null : <p role="alert">{edit.notice}</p>}
    </section>
  );
}
