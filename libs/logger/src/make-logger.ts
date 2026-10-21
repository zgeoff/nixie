import { getLogger } from '@logtape/logtape';
import type { LogFields, LogLevel, Logger } from './types';

// A line holds envelope fields only, because a log line that copies a message or a tool's result
// keeps that text after its key is shredded.
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
