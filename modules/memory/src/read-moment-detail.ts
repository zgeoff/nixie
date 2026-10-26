import type { Log } from '@heynixie/log';
import type { MomentTables } from './moment-types';
import type { MomentRow } from './read-moment-row';
import { readMomentText } from './read-moment-text';

interface MomentReflection {
  readonly reflectionID: string;
  readonly model: string;

  // the reflections' order, which a removal or a rewrite never changes
  readonly createdAt: number;
  readonly writtenAt: number;
  readonly text: string | null;
}

export interface MomentDetail {
  readonly title: string | null;
  readonly note: string | null;
  readonly reflections: readonly MomentReflection[];
}

export async function readMomentDetail(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  row: MomentRow,
): Promise<MomentDetail> {
  const reflections = await log.writer.db
    .$extendTables<MomentTables>()
    .selectFrom('moment_reflections')
    .selectAll()
    .where('moment_id', '=', row.moment_id)
    .where('is_removed', '=', 0)
    .orderBy('created_at')
    .orderBy('reflection_id')
    .execute();

  const title = await readMomentText(log, row.title_sequence, 'title');

  const note =
    row.note_sequence === null ? null : await readMomentText(log, row.note_sequence, 'note');

  const texts = await Promise.all(
    reflections.map((reflection) => readMomentText(log, reflection.text_sequence, 'reflection')),
  );

  return {
    title,
    note,
    reflections: reflections.map((reflection, index) => ({
      reflectionID: reflection.reflection_id,
      model: reflection.model,
      createdAt: reflection.created_at,
      writtenAt: reflection.updated_at,
      text: texts[index] ?? null,
    })),
  };
}
