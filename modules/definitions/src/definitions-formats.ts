// The definitions format this release writes. It reads this format and the one before, because an
// image upgrade and a definitions change land in either order.
const formatVersion = 2;

export const definitionsFormats = {
  readable: [formatVersion - 1, formatVersion].filter((version) => version >= 1),

  // the first format whose seed applies the skills; format 1 lists their files as unapplied
  skills: 2,
};
