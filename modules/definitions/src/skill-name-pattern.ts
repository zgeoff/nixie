// The Agent Skills rules for a name: 1 to 64 lowercase letters, digits and hyphens, with no hyphen
// at either end and no 2 in a row. The length limit sits in the frontmatter schema.
export const skillNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
