// An item ID that the model reads and passes back: the short ID of its connection, a dot, and
// Google's own ID. The prefix lets a call that names an item find its connection.
export function buildItemID(connection: string, id: string): string {
  return `${connection}.${id}`;
}
