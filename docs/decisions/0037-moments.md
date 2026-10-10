# 0037: Moments

- Date: 2026-10-11
- Status: decided
- Design: [moments](../design/platform/memory/moments.md)

nixie keeps moments beside the memory store. A moment is a range of records in one thread that nixie
keeps whole, with a title, your note and the model's reflections beside it. Memory items are the
statute: facts to act on. Moments are the case law: the conversations where a rule was set or
applied to a hard case, kept in their own words. A later model, which can differ from the one that
took part, reads a moment to apply a rule's reason to a case the rule does not cover, and you read
one to see how a decision was reached.

These choices settle moments:

1. **A span, not a copy.** A moment refers to its records by sequence, and nixie never copies the
   text. A kept span blocks automatic pruning, and a forget always wins over it.
2. **Your rules decide who keeps one.** The moment tools declare `note`, as the memory write tools
   do, so nixie keeps moments on its own wherever your rules allow `note`.
3. **Only you write the note.** A model writes a title or a reflection, and each reflection carries
   its model ID and date. A model edits only its own reflections.
4. **Read on purpose.** A model reaches a moment only through a tool call, from a search or from a
   memory item's "because" link, and never through per-turn retrieval or the pinned core.
5. **No new store.** Moments live in the event log, its projections and the key store, so the
   backups, the forget path and the export cover them unchanged. Destroying a moment shreds its own
   text, and the span's records stay.

## Why

- The event log holds every message and reply word for word, so a moment needs a boundary, a name
  and a reason, not a second copy of the text.
- One copy of the conversation keeps one forget path.
  [0031](0031-memory-capture-context-and-removal.md) rejected a second transcript copy for the same
  reason.
- A memory item holds a fact without its reason. A rule applied to a case it does not cover needs
  the conversation where the rule was set, and a link leads a model from the fact to that
  conversation.
- A moment kept out of per-turn retrieval stays whole and in its time, and a model reads it on
  purpose. Similarity search into context would turn moments into a second store of facts.
- The note records why a moment mattered at the time, so a model-written note would be a
  reconstruction.
- A label with the model ID and the date stops a later model's reading from passing as the reading
  of the model that took part.
- Under the principle "Behaviour is data", your rules decide whether nixie keeps moments on its own,
  and the system ships only the mechanism.
- A forget that wins over a span keeps the principle "The owner has root".

## Alternatives

- **A copy of the span under the moment's own key.** A moment then stands alone and exports simply,
  and the conversation gains a second copy with a second forget path.
- **Moments in per-turn retrieval.** A model would meet moments without asking, and similarity
  search over them would treat them as facts.
- **Keeping only on your request.** It removes the rule, and a task that runs while you are away
  could not keep the span that explains what it did.
- **A model-written summary in place of the span.** It loses the wording that a later case turns on,
  and a summary of an untrusted conversation can carry an injected instruction.
- **A new `moment` effect.** A moment write does the same as a memory write, so it shares `note`.
- **Import of transcripts from outside nixie.** It would make the one moment that holds its own
  copy, with its own forget path, for conversations nixie never saw.

## Consequences

- Each record of model output carries the model ID, so a reflection's label has a source that nixie
  sets.
- Any future pruning or retention of the event log skips records inside kept spans.
- Record sequences stay stable through migrations and restores, because spans refer to them.
- A span holds what the event log holds, so the model's reasoning is part of a moment only when the
  log records it.
