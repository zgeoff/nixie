import type { Log, LogTables } from '@heynixie/log';
import type { TurnInputsTables } from './turn-inputs-tables';

export function getTurnInputsDB(log: Pick<Log, 'writer'>) {
  return log.writer.db.$extendTables<TurnInputsTables & LogTables>();
}
