// An image upgrade and a definitions change reach a deployment in either order, so a release
// reads the format before its own too.
const formatVersion = 3;

export const definitionsFormats = {
  readable: [formatVersion - 1, formatVersion].filter((version) => version >= 1),

  skills: 2,

  prompts: 3,
};
