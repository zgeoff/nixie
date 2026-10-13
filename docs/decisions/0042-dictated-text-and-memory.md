# 0042: Dictated text and memory

- Date: 2026-10-11
- Status: decided
- Design: [memory writes](../design/platform/memory/writes.md)

Dictated text never counts as memory evidence under [0011](0011-memory-writes.md). A `dictated` span
is text that a voice client transcribed from speech. A memory write whose quote touches a `dictated`
span becomes a proposal, and during a call its card appears in the call screen under
[0041](0041-approvals-during-a-voice-call.md).

A destination token, such as an email address or a phone number, never passes the token check from
dictated text, even if a later decision relaxes the rest of this one. The live view counts proposals
by review reason, and those counts are the evidence for a revisit.

## Why

- A transcript can mishear a name, a number or an address. The token check then passes the wrong
  value, because it matches a quote that holds the same wrong value.
- A microphone also hears a TV, a video or another person, and a transcript cannot show who spoke,
  so other voices would be a route for injected memories.
- The card shows in the call screen, so a proposal costs one tap during the call.

## Alternatives

- **Dictated text counts as evidence.** It needs no review step, and lets misheard facts and other
  voices into memory unchecked.
- **Dictated text counts, except for a memory with a destination token.** It stops the most harmful
  injection, and lets misheard names and other voices through. It is the fallback if proposals
  become a burden.
