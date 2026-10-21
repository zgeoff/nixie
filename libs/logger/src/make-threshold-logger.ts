import { logLevels } from './log-levels';
import type { LogLevel, Logger } from './types';

export function makeThresholdLogger(log: Logger, threshold: LogLevel): Logger {
  const lowest = logLevels.indexOf(threshold);

  return (event, fields, level = 'info') => {
    if (logLevels.indexOf(level) >= lowest) {
      log(event, fields, level);
    }
  };
}
