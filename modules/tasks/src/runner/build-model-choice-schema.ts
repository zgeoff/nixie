import type { JSONObject } from '@heynixie/log';
import type { TaskStartBounds } from '../types';

// The JSON schema of a `model` option whose choices are the selectable models, the same names and
// descriptions wherever a tool offers them. Null when no model is selectable, and the tool then
// leaves the option out.
export function buildModelChoiceSchema(
  models: TaskStartBounds['models'],
  lead: string,
): JSONObject | null {
  if (models.length === 0) {
    return null;
  }

  const choices = models.map((entry) => `${entry.name}: ${entry.description}`).join('; ');

  return {
    type: 'string',
    enum: models.map((entry) => entry.name),
    description: `${lead} ${choices}`,
  };
}
