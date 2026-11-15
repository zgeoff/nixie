// Constants, with no config key and no definition key.
export const codeRunLimits = {
  // the program, from its start to its exit
  wallTimeMs: 60_000,

  // the whole call: create, copy in, the program, copy out, destroy
  callMs: 120_000,

  // per stream, the exec cap
  streamBytes: 1024 * 1024,

  // per stream, in the result's text
  shownStreamBytes: 32 * 1024,

  // the program, every input file and every skill file
  inputBytes: 64 * 1024 * 1024,
  outputFiles: 50,

  // every file under out/
  outputBytes: 20 * 1024 * 1024,
  shownImages: 4,

  // in one server process
  runsAtOnce: 2,
} as const;
