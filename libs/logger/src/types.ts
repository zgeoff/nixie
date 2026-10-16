import type { logLevels } from './log-levels';

// A JSON log line's fields beside its event: envelope values only, such as IDs, kinds, counts and
// outcomes, never message text, tool arguments or results.
export type LogFields = Readonly<Record<string, string | number | boolean | null>>;

// How much an event matters, from least to most: a threshold below an event's level writes it.
export type LogLevel = (typeof logLevels)[number];

// Writes one JSON line to the log, at info unless the call names another level.
export type Logger = (event: string, fields?: LogFields, level?: LogLevel) => void;
