import { z } from 'zod';
import { definitionsFormats } from './definitions-formats';

const manifestFormatSchema = z.looseObject({ format: z.number() });

export function findFormatBeforeSkills(manifest: string | null): number | null {
  if (manifest === null) {
    return null;
  }

  const parsed = manifestFormatSchema.safeParse(parseYAML(manifest));

  return parsed.success && parsed.data.format < definitionsFormats.skills
    ? parsed.data.format
    : null;
}

function parseYAML(text: string): unknown {
  try {
    return Bun.YAML.parse(text);
  } catch {
    return null;
  }
}
