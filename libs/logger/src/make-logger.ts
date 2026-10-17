import { getLogger } from '@logtape/logtape';
import type { LogFields, LogLevel, Logger } from './types';

// Makes the logger that passes each event to LogTape under the nixie category. A line holds the
// event and its envelope fields only, such as IDs and outcomes, because a line that copied a
// message or a tool's result would keep it after its key is gone.
export function makeLogger(): Logger {
  const logger = getLogger(['nixie']);

  const writers: Readonly<Record<LogLevel, (event: string, fields: LogFields) => void>> = {
    debug: (event, fields) => {
      logger.debug(event, fields);
    },
    info: (event, fields) => {
      logger.info(event, fields);
    },
    warn: (event, fields) => {
      logger.warn(event, fields);
    },
    error: (event, fields) => {
      logger.error(event, fields);
    },
  };

  return (event, fields = {}, level = 'info') => {
    writers[level](event, fields);
  };
}
