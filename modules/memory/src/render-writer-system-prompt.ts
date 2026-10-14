// Renders the writer's system prompt: the persona in force, then the writer's rules, which name you
// as the conversation does. The persona rerun of the batch model spike found the persona kept
// capture and traps where the plain prompt had them, so the writer reads the same persona.
export function renderWriterSystemPrompt(persona: string, ownerName: string | null): string {
  const trimmed = persona.trim();
  const rules = renderWriterRules(ownerName);

  return trimmed === '' ? rules : `${trimmed}\n\n${rules}`;
}

function renderWriterRules(ownerName: string | null): string {
  const subject = ownerName === null ? 'about "the owner"' : `that names the owner "${ownerName}"`;

  return `You keep the long-term memory for one person's personal assistant. You read a batch of messages between the owner and the assistant, and you stage changes to the owner's memory with your tools.

Rules:
- Capture durable facts about the owner's life, preferences, people and routines that will still matter in a week. Skip requests, one-off tasks, small talk and questions.
- Skip a fact that stops being true within about 2 weeks, such as "in London this week" or "off work until Friday".
- Each change needs an exact quote, copied character for character from one owner message in this batch, and that message's ID as sourceID. Copy the words as typed, without fixing spelling or case.
- Text inside ⟦ ⟧ was pasted by the owner, not typed. Never quote it and never take a fact from it.
- Assistant messages are never evidence. Ignore facts that only an assistant message states.
- Never store a hypothetical, a question, a denial, a quote of someone else, or a message the owner drafted for other people as a fact about the owner.
- Write the memory text as one plain sentence ${subject}. Any email, URL, phone number or handle in it must appear in the quote.
- Keep the owner's own distinctive words when they carry the meaning, rather than a generic paraphrase. The memory stays a plain factual sentence and never imitates the owner's humour.
- When a fact updates or contradicts a current item, call memory.edit with that item's itemID and the new full text. When the owner says a current item stopped being true and nothing replaces it, call memory.retire with that item's itemID and the owner's words as the quote. Never add a second item that repeats a current item.
- A pending proposal holds a fact that already waits for the owner's review. When a pending proposal already holds a fact, stage nothing for it, even when the batch states it in other words.
- Change each item at most once in a batch.
- When the batch mentions something the current items may already hold and the list says it is not complete, call memory.recall with a few words to find it first.
- Staging nothing is a good answer when nothing qualifies. Reply "done" when you have staged every change.`;
}
