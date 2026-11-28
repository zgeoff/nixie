// What every verify feature holds, so a change to any of it flags them all. When you can't tell
// whether a path reaches a feature, add it here: a missed feature costs more than a journey.
export const corePaths = {
  // Package folders that every journey runs, each with the workspace packages it depends on.
  packages: [
    // the turn path: each turn's session, its sandbox runner, and the tools and records it uses
    'modules/sessions',

    // the input each turn starts from
    'modules/turn-inputs',

    // the guest that runs every model turn
    'guests/conversation',

    // the rules and the proposals that every tool call passes through
    'modules/policy',

    // the record log that every write goes through
    'modules/log',

    // every turn's status reads the pinned memory and the week's moments
    'modules/memory',

    // memory's encoder, which the server loads at start
    'adapters/encoder-onnx',

    // every conversation reads its skill list
    'modules/skills',

    // the rules and prompts in force for every turn
    'modules/definitions',

    // the health and readiness that `doctor` checks before every journey
    'modules/ops',

    // no journey checks these
    'modules/backup',
    'adapters/definitions-repo-github',
    'guests/fetch',
    'guests/codex',
  ],

  // Globs that skip the dependency walk: `modules/api` and the server import every module, but
  // only to route a request to it or start its part.
  globs: [
    // global declarations that every package compiles against
    'nixie-test-build.d.ts',
    'bun-serve-options.d.ts',

    // shared code that every package imports
    'libs/**',

    // the API that every page calls
    'modules/api/**',

    // the code guest's image, which no journey builds
    'guests/code/**',

    // the server's package files, its entry points, and its startup and composition root
    'apps/server/*',
    'apps/server/src/*',
    'apps/server/src/{action,backup,budget,cli,config,conversation,credential,definition,deployment,erasure,feature,forget,leak,mocks,pause,place,prompt,proposal,queue,release,reminder,rule,sandbox,seed,server,spend,task,test,triggers,turn,utils}/**',

    // the part graph that starts every part, and the parts that no one feature owns
    'apps/server/src/part/{build-nixie-operation-schemas,build-seeding-connections,collect-host-held-names,front-part-declarations,get-sandbox-root-dir,has-breaking-marker,list-image-needs,load-start-state,make-lazy-tool-source,make-retried-start,make-step-error-logger,memory-part-declarations,missing-part-error,part-cycle-error,part-not-started-error,part-plan-error,plan-parts,register-harness-operations,register-server-record-topics,remove-swept-sandboxes,restart-sweep-part-declarations,run-restart-sweep-steps,server-inputs,server-part-declarations,server-part-values,server-record-kind,server-record-topics,start-checker,start-code-run-part,start-control-socket,start-held-credentials-part,start-host-commands,start-part-graph,start-proposal-sweeps,start-runners,start-sandbox-adapter-part,start-web-fetch-part,start-web-fetch,start-worker-part,tool-part-declarations,tools,warn-without-owner-rules,work-part-declarations}.ts',

    // the web client's package files, its entry points and its shell
    'apps/web/*',
    'apps/web/{icons,public}/**',
    'apps/web/src/*',

    // the shared components, and each folder that the shell or a shared component imports
    'apps/web/src/{approval,budget,call,client,coding,components,computer,conversation,device,features,image,live,memory,microphone,mocks,notice,outbox,passkey,pause,proposal,rule,spend,styled-system,task,theme,utils}/**',

    // the shell, the conversation, the proposals, and the pages that no journey opens
    'apps/web/src/routes/{__root,index,proposals,definitions,files,passkeys,reminders}.tsx',
  ],
} as const;
