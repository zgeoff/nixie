// The stream that the mock API names for a watch. A browser suite sets it to a desktop of its own,
// and clears it after, so every other suite gets a path no server answers.
export const mockComputerStream: { url: string | null } = { url: null };
