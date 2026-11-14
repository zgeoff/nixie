import { getPromptParts, promptIDs } from '@heynixie/prompts';
import type { z } from 'zod';

export function formatManifestIssue(issue: z.core.$ZodIssue): readonly string[] {
  const [field, id, key] = issue.path.map(String);

  if (field !== 'prompts') {
    return ['skills must be a list of skill names'];
  }

  if (issue.code === 'unrecognized_keys' && id === undefined) {
    return issue.keys.map(
      (name) => `prompts: no prompt is named ${name}; the prompts are ${promptIDs.join(', ')}`,
    );
  }

  const promptID = promptIDs.find((candidate) => candidate === id);

  if (promptID === undefined) {
    return ['prompts must map each prompt to its overrides'];
  }

  if (issue.code === 'unrecognized_keys') {
    const parts = getPromptParts(promptID).join(', ');

    return issue.keys.map(
      (name) => `prompts.${promptID}: the prompt has no part ${name}; its parts are ${parts}`,
    );
  }

  if (key === undefined) {
    return [`prompts.${promptID} must map each part to a file`];
  }

  return key === '_template'
    ? [`prompts.${promptID}._template must be text`]
    : [`prompts.${promptID}.${key} must be the path of a file`];
}
