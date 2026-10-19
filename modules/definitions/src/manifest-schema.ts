import { z } from 'zod';
import { definitionsFormats } from './definitions-formats';
import { manifestSkillsSchema } from './manifest-skills-schema';

const formatsBeforeSkills = definitionsFormats.readable.filter(
  (version) => version < definitionsFormats.skills,
);

const formatsWithSkills = definitionsFormats.readable.filter(
  (version) => version >= definitionsFormats.skills,
);

// nixie.yaml as the seed reads it: a format this release reads and, from the skills format on, the
// conversation's skill list. The seed reads no other key, so the manifest may hold more, and it
// ignores the skill list under an earlier format.
export const manifestSchema = z.union([
  z.looseObject({ format: z.literal(formatsBeforeSkills) }),
  manifestSkillsSchema.extend({ format: z.literal(formatsWithSkills) }),
]);
