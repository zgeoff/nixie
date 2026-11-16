import { z } from 'zod';

// The notice of one change of a task definition, built at read time from the record, the change's
// row and its version
export const definitionNoticeSchema = z.object({
  definitionID: z.string(),

  // null when the key of the version is lost
  name: z.string().nullable(),

  operation: z.enum(['add', 'change', 'remove', 'undo']),
  shortID: z.string(),
  changeID: z.string(),

  // false when the change leaves the definition with no version: a removal, or an undo of an add
  hasVersion: z.boolean(),

  // the words of the change's own version; null with no trigger or when unreadable
  rendered: z.string().nullable(),

  // the date of the next fire; null once the change is out of force
  next: z.string().nullable(),

  state: z.enum(['in_force', 'superseded', 'adopted', 'retired']),
  isUnreadable: z.boolean(),
});

export type DefinitionNotice = z.output<typeof definitionNoticeSchema>;
