import { z } from 'zod';

const itemSchema = z.object({ itemID: z.string() });
const cardSchema = z.object({ items: z.array(itemSchema) });

// The IDs of the items a stored approval card holds, or null for bytes that are no card.
export function parseRetopicCard(bytes: Uint8Array): readonly string[] | null {
  const text = new TextDecoder().decode(bytes);

  const card = cardSchema.safeParse(parseJSONOrNull(text));

  return card.success ? card.data.items.map((item) => item.itemID) : null;
}

function parseJSONOrNull(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
