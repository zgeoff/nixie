# Prompts

Six built-in prompts start nixie's model calls: the memory writer's, the consolidator's, the content
checker's, the retirement checker's, the conversation's session prompt, and the compaction
instruction. Each prompt is a set of named parts and a template that arranges them. A deployment can
override any part or the template of any prompt from its definitions, and every part or template it
leaves unset keeps nixie's built-in text. Each prompt has a part named `safety` that holds its rules
against pasted text, fetched pages and other input that tries to steer the model. An override can
replace or drop that part, and the operator log is the one place that shows it.

## Parts, templates and paths

A template is text with `{{ path }}` slots, and the prompt fills each slot from one context object.
The object holds the values the caller passes, such as the user's name or the skill catalog, and
`parts.<name>` for each part. A part's text has slots too, which the prompt fills from the same
values and from the parts that come before it. A part with a condition, such as the persona part
when no persona is in force, renders as empty text. The filled text is never filled again, so braces
inside a persona or a name stay literal. The delimiter is `{{ }}` because the built-in text holds
backticks, «» and ⟦⟧ as literal text.

Each prompt accepts its own paths: the consolidator reads the cap on changes, and the compaction
instruction reads the word target. [Overriding a prompt](../../guides/overriding-a-prompt.md) lists
each prompt's parts and paths.

## Overrides from the definitions

From definitions format 3, the `prompts:` map in `nixie.yaml` holds the overrides, keyed by prompt
and then by part. A part's value is the path of a file in the definitions, and the `_template` key
holds a template inline. The seed reads each part file, drops its final line breaks, and refuses the
definitions when any of these is true:

- The map holds a prompt or a part that nixie does not have.
- A part's file is missing from the definitions or is not UTF-8 text.
- A part or a template reads a path that its prompt does not accept. A part also may not read itself
  or a later part.

The error holds the path of the file at fault, and the seed never renders a missing value as empty
text. The seed's unapplied list holds each file under `prompts/` that the map does not read. Format
2 definitions load with no overrides, and the seed lists their `prompts:` files as unapplied.

The seed stores the override text in the definitions snapshot, so a changed part file changes the
snapshot hash. An absent or empty map adds nothing to the snapshot, so definitions without overrides
keep the snapshot hash of the same definitions at format 2. Every render takes the overrides from
the snapshot in force, so a seed changes the prompts without a restart.

## Reading a prompt from the conversation

The conversation's tool endpoint serves `prompt_read`, which returns one prompt in the shape an
override starts from: each part's built-in text, the default template, the paths that each part and
the template accept, and the text that the definitions in force put in place of each. A part accepts
the prompt's own paths and each part before it, and the template accepts every part, the rule the
seed checks an override against. The result counts as the user's data, because nixie ships the
built-in text and the user's definitions hold every override.

## Overrides that the model proposes

When the definitions export is configured, the conversation's tool endpoint also serves
`prompt_write`, which proposes an override of one prompt: its entry in the `prompts:` map, the part
files the entry reads, and a reason for the user. Without the export, an approved override has no
way into the definitions, so the model gets no tool to propose one. A proposal goes through the same
checks as the seed's parse of the `prompts:` map, plus the rules for the files themselves: each sits
under `prompts/`, the entry reads it, and it fits the seed's file size limit. A proposal that fails
any check returns every problem to the model and records nothing. A proposal that passes becomes a
record on the caller's thread with a short ID, and a proposal may replace or drop the `safety` part.

The prompts module runs the definitions parse as a check that its caller passes in, because the
definitions module already imports the prompts module and the reverse import would form a cycle. The
server passes the definitions module's prompt check to the tool and to the host procedures, and it
builds the event kind that turns each answer into a turn note for the same reason.

The user answers through the prompt host commands, which list each pending proposal beside the
override in force and the proposal hash that an answer names. The server refuses an answer under
another hash, to a proposal that an answer or a lapse closed, and an approval of a proposal whose
base, the override in force when the model proposed, has moved. An approval may carry the user's
edits to the entry and the files, and the server runs the same checks on the approved version as on
the proposal. A proposal with no answer lapses after the shared proposal lapse period, and the lapse
sweep closes it.

An approval leaves the prompt as it is in force and records the approved version as the prompt's
current approval, superseding the one before. The [definitions export](./definitions.md) then opens
a pull request on the prompt's branch with the part files and the prompt's entry in `nixie.yaml`,
and moves `nixie.yaml` to format 3 when the base branch holds an older format. The pull request's
body holds the reason and a note when the override replaces or drops the `safety` part. The override
goes into force with the seed after the pull request merges and `live` is promoted. Each answer and
each opened pull request reaches the model as a turn note on the proposal's thread, and the note for
an opened pull request holds its URL.

## Safety parts and the operator log

A prompt runs without its built-in safety rules when an override replaces its `safety` part, or when
a template override never reads `{{ parts.safety }}`. nixie needs no flag for either. After each
seed that puts a new snapshot in force, startup included, the server writes one
`prompts.safety_missing` line to the operator log when any prompt runs that way, with each such
prompt marked `replaced` or `omitted`. The event log that the model reads gets nothing.

## Checker prompts and the policy hash

The content checker and the retirement checker gate what reaches memory, so the policy rules hold a
hash of each one's rendered prompt. The seed renders both with the overrides in force, so a checker
override changes the policy hash, and the session-opened record that carries the policy hash shows
which checker gated each memory. The memory checker's evaluation runs against the built-in prompt
alone, and a checker override has no evaluation behind it.
