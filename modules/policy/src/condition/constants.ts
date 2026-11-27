import type { TimePart } from './types';

export const maxConditionChars = 1000;
export const maxConditionNodes = 100;
export const maxConditionDepth = 12;
export const maxConditionListElements = 50;
export const maxConditionCallArguments = 3;

// The library evaluates synchronously, so no timer can stop it. These bound the work instead.
export const maxInputListElements = 1000;
export const maxInputStringUnits = 262_144;
export const maxInputDepth = 32;
export const timeParts: readonly TimePart[] = ['hour', 'minute', 'weekday', 'day', 'month', 'year'];

// The names of the functions that read each part of a timestamp in a zone, apart from the host.
export const zonedFunctionNames: Readonly<Record<TimePart, string>> = {
  hour: 'zonedHour',
  minute: 'zonedMinute',
  weekday: 'zonedWeekday',
  day: 'zonedDay',
  month: 'zonedMonth',
  year: 'zonedYear',
};

// The function that a macro's receiver passes through, so a map receiver fails the evaluation
// instead of looping over its keys.
export const listReceiverFunctionName = 'listReceiver';
