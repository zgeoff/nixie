// The known definitions paths: 2 files at the root and 3 folders. Sources read only these, so a
// definitions repo can hold docs, readmes and scripts beside them without touching the snapshot.
export const definitionsLayout = {
  files: new Set(['nixie.yaml', 'persona.md']),
  folders: new Set(['jobs', 'rules', 'skills']),
};
