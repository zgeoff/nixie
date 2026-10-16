import { logLevels } from './log-levels';
import type { LogLevel, Logger } from './types';

// Makes the logger that passes an event to log only when its level is at the threshold or above
// it, so the deployment configuration can quiet the events below that level.
export function makeThresholdLogger(log: Logger, threshold: LogLevel): Logger {
  const lowest = logLevels.indexOf(threshold);

  return (event, fields, level = 'info') => {
    if (logLevels.indexOf(level) >= lowest) {
      log(event, fields, level);
    }
  };
}
