import { z } from 'zod';
import { definitionsFormats } from './definitions-formats';
import { manifestSkillsSchema } from './manifest-skills-schema';

const formatsBeforeSkills = definitionsFormats.readable.filter(
  (version) => version < definitionsFormats.skills,
);

const formatsWithSkills = definitionsFormats.readable.filter(
  (version) => version >= definitionsFormats.skills,
);

export const manifestSchema = z.union([
  z.looseObject({ format: z.literal(formatsBeforeSkills) }),
  manifestSkillsSchema.extend({ format: z.literal(formatsWithSkills) }),
]);
