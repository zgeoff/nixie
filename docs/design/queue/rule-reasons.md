# Rule reasons: what a rule's reason links to

A [rule](../../glossary.md) is an allow, an ask or a deny in your definitions. A rule's reason is
why you set it. In the built code, a rule holds its reason only as a written note. This doc covers a
link from a rule to the place its reason came from, such as the [moment](moments.md) in which you
set the rule. Whether a rule links at all, and to what, is not designed: you settle it in a design
session.

Terms are in the [glossary](../../glossary.md): rule, definitions, moment, record, memory item,
evidence and event log. This doc adds one:

- **A reason link** is a reference from a rule to the record or the moment that the rule came from.

Each question that is not settled is marked here as `(open: <name>)`.
[The open list](open/moments.md) holds it under that name, with its options and its tracker issue.
This doc gives only the order of the questions. Slice 9 of [the slices](slices/moments.md), the list
of work for the moments designs, is the design session. The other moments designs have a file of
TypeScript types in `sketches/moments/`. This doc has none, because no format of a link is agreed.

"Built" describes the code as it stands. The sections after it give what a link must meet and what
is left to design.

## Built

- The rule body schema of the policy module defines a `note` field on a rule, for a text that you
  write. nixie renders each rule as one sentence for a model, and that sentence holds no note.
- A rule also changes at runtime, while nixie is up. nixie records with each such change who made it
  and why.
- The rule parser refuses a field that it does not know. A link in a rule is therefore a change of
  the rules file format.
- `pickRuleChange` decides whether a change to a rule widens what the rule allows. It treats a
  change to the note alone as no change.
- A moment's ID is random, and a change of the definitions never changes it. A record's sequence,
  the number that identifies the record in the event log, is stable through migrations and restores.
  A reset of the log destroys every moment and every record.
- `moment.read` returns "not found" for a destroyed moment. A read of a forgotten record returns a
  gap: the record's place and sequence, with no text.
- A memory item's evidence is your quote. The evidence holds the sequence of the one record that the
  quote is from, and the offsets of the quote in it.
- A memory item can hold a "because" link: a reference to the moment that gives the item's reason.
  Its target is a moment only. When you forget the item, nixie drops the link from the
  `moment_links` projection.

## What a link must meet

These hold for any reason link:

- A rule lives in a file of the definitions, outside the database, and you write it. A link is
  therefore a field of that file.
- `pickRuleChange` treats a change to a rule's link alone as it treats a change to the note alone:
  the change widens nothing.

A link has 2 candidate targets. One is a moment, a whole stretch of conversation. The other is one
record, because a rule can come from a single message of yours, and a message is one record.

## Not designed

The tracker holds 2 issues for this work: one for the design session, and one for the build of a
link. The open list links both. The build issue was written before any design, so a builder never
builds from its text as it stands. In the design session, you agree a decision record, and the
[moments design](moments.md) changes to match that record. The build issue is then rewritten to the
decision, or closed. The session answers these questions, in this order:

1. Whether a rule needs a link, or the note is enough. (open: rule link need)
2. What a link targets. (open: rule link target)
3. What a link shows when its target is a destroyed moment or a forgotten record. (open: rule link
   gone target) The answer depends on how a forgotten record reads, which [redaction](redaction.md)
   defines.
4. Whether a memory item's "because" link needs the same answer as question 3, and whether that link
   can also target one record. (open: item because links)
5. How a rule in YAML refers to a moment's ID. This question exists only when the answer to question
   2 includes a moment. (open: rule moment reference)

A release without the link format refuses a rules file that holds a link, because its parser refuses
the field. Nobody has decided what a rollback to such a release does with the file. (open: parked
rollback)

## Not in scope

- A rule in the database.
- Any change to the note.
