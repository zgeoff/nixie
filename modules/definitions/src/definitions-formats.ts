// An image upgrade and a definitions change reach a deployment in either order, so a release
// reads the format before its own too.
const formatVersion = 4;

export const definitionsFormats = {
  readable: [2, 3, formatVersion],

  skills: 2,

  prompts: 3,

  rules: 3,

  effects: 4,
};
