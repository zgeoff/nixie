export const codeRunMessages = {
  runsAtOnce:
    '2 code runs are in progress, which is the most at once. Call again when one has returned.',
  startFailed: 'nixie could not start the code sandbox. A second call starts a new one.',
  callTimeout: 'The code run took more than 120 s, so nixie stopped it.',
  sessionEnded: 'A forget ended this session during the code run, so nixie kept nothing from it.',
  runFailed: 'nixie could not finish the code run in its sandbox. A second call starts a new one.',
} as const;
