import { z } from 'zod';
import type { DefinitionSection } from '../section/definition-sections';

const filePath = 'extras/extras.yaml';
const fileSchema = z.strictObject({ count: z.int().positive().max(1000) });

// A section in the shape a feature adds: one folder, a count in its one file, and a fault that
// leaves the file unapplied.
export function buildStubSection(): DefinitionSection {
  return {
    key: 'extras',
    folder: 'extras',
    minFormat: 5,
    problemEvent: 'definitions.extras_file_skipped',
    parse: (texts) => {
      const text = texts.get(filePath);

      if (text === undefined) {
        return { value: null, problems: [], paths: new Set() };
      }

      try {
        const file = fileSchema.parse(Bun.YAML.parse(text));

        return { value: { count: file.count }, problems: [], paths: new Set([filePath]) };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);

        return { value: null, problems: [{ path: filePath, reason }], paths: new Set() };
      }
    },
    toForm: (value) => ({
      count: fileSchema.shape.count.parse(z.looseObject({ count: z.unknown() }).parse(value).count),
    }),
    parseForm: (form) => {
      const stored = z.looseObject({ extras: fileSchema.nullable().default(null) }).safeParse(form);

      return stored.success ? stored.data.extras : null;
    },
  };
}
