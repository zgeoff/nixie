# The open list: milestone 4

The items that block a build of milestone 4. 92 items block a build, and 49 of them are yours.
[The open list](open.md) explains the kinds and the marks, and holds the other milestones.

- [recovery hold fire](open/definitions.md#not-decided) (yours): What does a fire get when its task
  is under a recovery hold? Intended: the reader returns `held`, nixie writes a skip with
  `task_held`, and the first slot after the release fires.
- [page cache](open/web.md#not-decided) (yours): Does a `url` or `link` call read a page cache, and
  what is the default? Intended: the cache, on by default at 5 minutes.
- [forget clears pauses](open/web.md#not-decided) (yours): Does a forget clear the map of paused
  hosts? Intended: yes.
- [hop scan place](open/web.md#not-decided) (yours): Where does nixie scan each hop's URL? Intended:
  the server scans each hop on the fetch's open stream.
- [typed text](open/web.md#not-decided) (yours): Which text counts as typed for the exemption?
  Intended: typed spans of the thread's newest 50 readable messages.
- [typed url redirects](open/web.md#not-decided) (yours): Does the exemption of a typed URL cover
  the hops of its fetch? Intended: nixie scans every hop, and a hop that matches a public rule
  passes.
- [own values exemption](open/web.md#not-decided) (yours): Does a typed URL that holds an own value
  pass? Intended: nixie refuses it, at the named URL and at every hop.
- [refused url record](open/web.md#not-decided) (yours): Does the call record hold the refused URL?
  Intended: yes.
- [own value entries](open/web.md#not-decided) (yours): Which entries of the secrets file are own
  values? Intended: the 5 credential entries.
- [own value length](open/web.md#not-decided) (yours): What is the shortest own value that the scan
  matches? Intended: 8 characters.
- [skill file scan](open/web.md#not-decided) (yours): Does nixie scan the fetches of the skill file
  reader? Intended: yes.
- [log event host](open/web.md#not-decided) (yours): Does the log event of a refusal hold the host?
  Intended: the rule and the hop's number alone.
- [set identity](open/operations.md#not-decided) (yours): What identifies a backup set? Intended:
  publish numbers that the backup job counts in the repositories.
- [one fetch command](open/operations.md#not-decided) (yours): Does one command fetch the pair, or
  do `fetch data` and `fetch keys`? Intended: one command.
- [stopped fetch](open/operations.md#not-decided) (yours): How does `nixie restore` refuse a stopped
  fetch? Intended: the unfinished-backup marker.
- [named snapshot window](open/operations.md#not-decided) (yours): Does the fetch refuse a named
  data snapshot from before a restore of a local directory? Intended: it refuses it as
  `data-unproven`.
- [forgotten items](open/operations.md#not-decided) (yours): What happens to items forgotten after
  the data snapshot of an `older-data` pair? Intended: the restore finishes each forget whose key is
  gone, as a follow-up.
- [finish-forgets place](open/operations.md#not-decided) (yours): Where does a `finish-forgets` take
  place, if you choose it? Intended: at the next start, in the start part `recovery_holds`.
- [forgottenItems value](open/operations.md#not-decided) (yours): Which value of `forgottenItems`
  does `nixie restore` pass in the first build? Intended: `leave-unreadable`.
- [hold design](open/operations.md#not-decided) (yours): Which design does the recovery hold take?
  Intended: claim candidates that name their hold subjects, with a `recoveries` table.
- [held tasks](open/operations.md#not-decided) (yours): Which tasks does a restore hold? Intended:
  every unfinished task, less `memory-writer` and `memory-consolidator`.
- [holds always](open/operations.md#not-decided) (yours): Does every restore install holds, or does
  a flag turn them off? Intended: every restore installs holds.
- [release control name](open/operations.md#not-decided) (yours): Is the hold release a 7th control,
  `release`, or a part of `resume`? Intended: a 7th control, `release`.
- [release one or all](open/operations.md#not-decided) (yours): Does a hold release take one task a
  call, or all tasks as well? Intended: one task a call.
- [restore notice](open/operations.md#not-decided) (yours): Is the agent told of a restore?
  Intended: yes, by the restore notice.
- [launch sources](open/operations.md#not-decided) (yours): Does a restore hold launch sources?
  Intended: none in the first build.
- [first publish](open/operations.md#not-decided) (yours): What does nixie stage between a restore
  and the last hold release? Intended: no backup set while a recovery hold is open.
- [restore step order](open/operations.md#not-decided) (yours): Does the restore write `holding`
  after or ahead of the move and the restore note? Intended: after them.
- [drill credential](open/operations.md#not-decided) (yours): Which credential does the drill use
  for the repositories? Intended: one that cannot delete, where the backend offers one.
- [recovery read null](open/operations.md#not-decided) (yours): When does `recovery/read` return
  `recovery: null`?
- [boundary design](open/harnesses.md#not-decided) (yours): Which design does the harness boundary
  take? Intended: one definition per harness, bound to its profile, with one host encoder.
- [outcome values](open/harnesses.md#not-decided) (yours): Which values does a turn's outcome take?
  Intended: `finished`, `limit`, `interrupted`, `overflow` and `stopped`.
- [codex memory roles](open/harnesses.md#not-decided) (yours): May a `codex` profile serve a memory
  role? Intended: build the Codex harness after the delete of the 2 built-in memory tasks.
- [definition home](open/harnesses.md#not-decided) (yours): Where does a harness's host-side
  definition live? Intended: the models module.
- [codex effort pin](open/harnesses.md#not-decided) (yours): Does the boundary's pull request pin
  the Codex CLI, or does the `codex` member go in the guest's?
- [request change place](open/harnesses.md#not-decided) (yours): Where is a request outside Claude
  changed? Intended: in the conversation guest, by a match on the system prompt's tail.
- [missing mark refusal](open/harnesses.md#not-decided) (yours): May a profile load with no
  `outside_claude` and a model ID without `claude`? Intended: refuse at load.
- [openrouter harness record](open/harnesses.md#not-decided) (yours): Which harness record does the
  OpenRouter work build against? Intended: the record that stands when the slice is built.
- [capture and store](open/harnesses.md#not-decided) (yours): Where does the turn-input log capture
  and store a request? Intended: a spool sealed to a key per step, with files outside the backup
  set.
- [forget and the log](open/harnesses.md#not-decided) (yours): What does a forget do to the
  turn-input log? Intended: `on_forget: threads`.
- [retention limit](open/harnesses.md#not-decided) (yours): How long does the turn-input log hold a
  request? Intended: 7 days and a byte bound.
- [log default](open/harnesses.md#not-decided) (yours): Is the turn-input log on by default?
  Intended: off until you turn it on, for a set time.
- [log roles](open/harnesses.md#not-decided) (yours): Which roles does the turn-input log cover?
  Intended: `conversation` and `task`.
- [secret in a request](open/harnesses.md#not-decided) (yours): What does the log do with a request
  whose text holds a secret? Intended: accept and seal it, and record a miss for an own secret
  value.
- [redaction parts](open/moments.md#not-decided) (yours): Which of the 3 redaction parts get built?
  Intended: tool records and the removal mark, in that order.
- [redaction kinds](open/moments.md#not-decided) (yours): Which record kinds does a redaction take?
  Intended: every record of a thread that has a key, except a moment's or a memory item's own
  records.
- [redaction actor](open/moments.md#not-decided) (yours): Who redacts: you in the client only, or a
  tool for the agent as well? Intended: you only.
- [redaction evidence items](open/moments.md#not-decided) (yours): What does a redaction do to a
  memory item whose evidence is the record? Intended: the preview lists each item, and you forget
  each apart.
- [preview procedure name](open/moments.md#not-decided) (yours): What is the name of the read
  procedure behind the removal preview? Intended: `conversation.readForgetPreview`.
- [branch slash](open/web.md#not-checked): Does GitHub's API answer 404 when `ref` is the first
  segment of a branch name with a slash?
- [wikipedia path](open/web.md#not-checked): Which Wikimedia path for a page's HTML do the API docs
  list as supported?
- [sandbox frames](open/web.md#not-checked): Does a real sandbox carry several frames each way for
  the fetch image?
- [betterleaks pin](open/web.md#not-checked): Is commit `81aff7a` of betterleaks under the MIT
  licence, with its rule file?
- [fresh with page text](open/web.md#not-written): Which tool error does a call with `fresh` and
  `page` get? Intended: nixie refuses the call, and the sentence holds that `fresh` goes with `url`
  or `link`.
- [hostless hop sentence](open/web.md#not-written): What is the hop refusal when the sending host's
  own name matches the finder? Intended: the sentence holds the rule and no host.
- [image release reason](open/web.md#not-written): Which reason replaces a `failed` reply with
  `isGated: false` to a gated request? Intended: the fetch image is of a release before the
  server's.
- [description sentence](open/web.md#not-written): What does the web fetch tool's description say
  about a rewrite? Intended: a page of a known site comes back in its raw or JSON form, and `url`
  shows what nixie fetched.
- [unwritten shapes](open/web.md#not-written): What are the signatures of `makeFetchBackoff`, the
  cache lookup, `collectOwnValues`, the builder of `isOwnerTyped` and `makeTypedExemption`?
- [retry header order](open/web.md#not-written): Which header gives `retryAfterMs` when a reply
  holds both `Retry-After` and a spent `x-ratelimit-reset`?
- [restic tags](open/operations.md#not-checked): Does restic store the 3 tag shapes as written, and
  list them back?
- [unknown kind readers](open/operations.md#not-checked): Does every thread reader of the release
  before skip a record of an unknown kind?
- [done task pending action](open/operations.md#not-checked): Can a done or stopped task own a
  pending action with a started attempt?
- [repository method names](open/operations.md#not-written): What are the names of the 2 methods
  that the repository interface adds? Intended: `readSnapshots` and `restoreSnapshot`, the sketch's
  own.
- [refusal texts](open/operations.md#not-written): What text do each `PairRefusal`, the last line of
  `nixie restore` and `TASK_NOT_HELD` have?
- [fetch step names](open/operations.md#not-written): Which step values does `backup.fetch_failed`
  carry beside `pick`?
- [schedule hold read](open/operations.md#not-written): How does the backup schedule read whether a
  recovery hold is open?
- [restore notice text](open/operations.md#not-written): Which date format and time zone does the
  restore notice use?
- [restore result](open/operations.md#known-faults): Does `restoreDataBackup` return `{ pair }` or
  `DataRestore | DataRefusal`? Intended: the code's `DataRestore | DataRefusal`, with `pair` on
  `DataRestore`.
- [codex effort values](open/harnesses.md#not-checked): Which effort values does the pinned Codex
  CLI have?
- [codex secret header](open/harnesses.md#not-checked): Which header does the model API take for the
  key in `OPENAI_API_KEY`?
- [codex tool output limit](open/harnesses.md#not-checked): Which `tool_output_token_limit` passes a
  `memory.recall` result of the page limit whole?
- [codex untested paths](open/harnesses.md#not-checked): Do the 6 untested Codex paths pass in a
  test imp?
- [agent-sdk unkept](open/harnesses.md#not-checked): Can an Agent SDK task have an opening and no
  stored point?
- [long prompt probe](open/harnesses.md#not-checked): What does the CLI do past 200,000 tokens for a
  model outside its catalogue?
- [system blocks probe](open/harnesses.md#not-checked): Does every request hold the system prompt as
  a tail of its system blocks?
- [provider order field](open/harnesses.md#not-checked): Which body field does OpenRouter's Messages
  route take for a provider order?
- [base URL path probe](open/harnesses.md#not-checked): Does each harness's CLI accept a base URL
  with one more path segment?
- [rollback reads input records](open/harnesses.md#not-checked): Does the last release a deployment
  ran read past the 7 `model.input_*` kinds?
- [codex tool-call timeout](open/harnesses.md#not-checked): Does Codex obey a config key for the
  timeout of one tool call?
- [defineHarness signature](open/harnesses.md#not-written): What are the signatures of
  `defineHarness` and `HarnessProfileSchema`? Intended: `defineHarness` takes a definition and
  checks the `session` rule at load; `HarnessProfileSchema` is a strict schema without `id`.
- [host error texts](open/harnesses.md#not-written): What is the text of each guest-neutral host
  error? Intended: each holds the name of the guest of the step's harness, or no guest's name.
- [turnInputs procedures](open/harnesses.md#not-written): What are the inputs and outputs of the 3
  `turnInputs` procedures and the 4 `nixie turn-input` commands? Intended: `list` returns envelope
  fields and misses, `open` takes one input ID, `set` takes a state and an optional time.
- [capture tag layout](open/harnesses.md#not-written): What is the byte layout inside the `~in.`
  tag? Intended: the base64url of the capture ID and the public key, with a committed fixture.
- [drop and reset cause](open/harnesses.md#not-written): Which `cause` does `model.input_removed`
  hold for a reset or `nixie turn-input off --drop`?
- [codex config keys](open/harnesses.md#not-written): Which Codex config keys turn off its own
  skills, agents, project docs and unasked input text?
- [miss reason triggers](open/harnesses.md#not-written): What triggers the miss reasons
  `unknown_capture` and `store_unavailable`?
- [limit stop outcome](open/harnesses.md#known-faults): Does a guest that stops at
  `limits.modelCalls` end as an interrupted turn or with `outcome: 'limit'`? Intended: `limit`.
- [session field name](open/harnesses.md#known-faults): Is the Codex record's field
  `listSessionFiles: null` or `session: null`? Intended: `session`.
- [photo description sentences](open/moments.md#not-written): What do the descriptions of
  `moment.read` and `log.read_image` say about images? Intended: pass a record's `eventID` and an
  image's `n` to `log.read_image`.
- [preview order](open/moments.md#not-written): When does the moment view read the removal preview,
  and where does it show the 2 counts?
- [removal control tests](open/moments.md#not-written): Which tests cover the removal control and
  its preview read? Intended: the tests in slice 6.
- [removal sentence](open/moments.md#not-written): What is the moment view's full sentence for a
  removed record? Intended: the word "removed", in the form of the built gap sentence.
