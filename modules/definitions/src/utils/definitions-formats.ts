// An image upgrade and a definitions change reach a deployment in either order, so a release
// reads the format before its own too.
const formatVersion = 7;

export const definitionsFormats = {
  readable: [2, 3, 4, 5, 6, formatVersion],

  current: formatVersion,

  skills: 2,

  prompts: 3,

  rules: 3,

  effects: 4,

  tasks: 4,

  budgets: 5,

  mcp: 6,

  places: 7,
  voice: 5,
};
