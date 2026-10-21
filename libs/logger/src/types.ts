import type { logLevels } from './log-levels';

export type LogFields = Readonly<Record<string, string | number | boolean | null>>;

export type LogLevel = (typeof logLevels)[number];

export type Logger = (event: string, fields?: LogFields, level?: LogLevel) => void;
