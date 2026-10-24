import invariant from 'tiny-invariant';
import { z } from 'zod';
import { definitionsFormats } from './definitions-formats';
import { manifestPromptsSchema } from './manifest-prompts-schema';
import { manifestSkillsSchema } from './manifest-skills-schema';

const formatsBeforeSkills = definitionsFormats.readable.filter(
  (version) => version < definitionsFormats.skills,
);

const formatsBeforePrompts = definitionsFormats.readable.filter(
  (version) => version >= definitionsFormats.skills && version < definitionsFormats.prompts,
);

const formatsWithPrompts = definitionsFormats.readable.filter(
  (version) => version >= definitionsFormats.prompts,
);

const [firstSchema, ...otherSchemas] = [
  z.looseObject({ format: z.literal(formatsBeforeSkills) }),
  manifestSkillsSchema.extend({ format: z.literal(formatsBeforePrompts) }),
  manifestSkillsSchema.extend({
    format: z.literal(formatsWithPrompts),
    prompts: manifestPromptsSchema.optional(),
  }),
].filter((schema) => schema.shape.format.values.size > 0);

invariant(firstSchema, 'the release reads no definitions format');
export const manifestSchema = z.discriminatedUnion('format', [firstSchema, ...otherSchemas]);
