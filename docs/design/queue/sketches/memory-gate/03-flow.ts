// Memory gate: each flow as commented code. Not compiled. No package imports this file.
// Shapes and texts: 02-types.ts. Where a doc and a sketch differ, the sketch wins for shapes and
// the doc wins for rules.

// ---- A. One memory.remember or memory.edit with text ----

async function writeGatedRemember(parts, request) {
  // Step 0. Refusals: a tool error, and nothing is written.
  requireFutureEndTime(request.until);

  const { subject, newSubject, item } = await readSubjects(parts, request);

  const isFirstSelfNote = newSubject === 'self' || (item === null && subject === 'self');

  if (isFirstSelfNote && request.caller.origin !== 'conversation') {
    throw new SelfNoteError(selfNoteFromTask); // 02-types.ts, section G
  }

  if (request.image) await requireImageSource(parts, request); // the image is one of yours

  // Step 1. Route by subject.
  const gate =
    (newSubject ?? subject) === 'self'
      ? await runSelfNoteGate(parts, request) // section B
      : request.image
        ? await runImageGate(parts, request) // section C
        : await runContentGate(parts, request); // section D

  // Step 8. A hold after a pass.
  const held = pickSubjectChangeReview(newSubject, gate); // 'subject_change'

  // Step 9. One transaction.
  return withWriteTransaction(async (tx) => {
    if (held.status === 'review') return writeProposalRecord(tx, parts, request, held); // section H

    // A forget of the quoted message between the gate and the apply gives 'forgotten_evidence'.
    return writeVersion(tx, parts, request, held); // the version, its record, the notice entry
  });
}

// ---- B. The self-note gate ----

async function runSelfNoteGate(parts, request) {
  if (hasHiddenCharacter(request)) return review('invisible_character', { tokens: 'fail' });

  const tokens = await readTokenVerdict(parts, request); // against everything you typed in the window

  return review('self_note', { tokens }); // always waits
}

// ---- C. The image gate ----

async function runImageGate(parts, request) {
  if (hasHiddenCharacter(request)) return review('invisible_character', { tokens: 'fail' });

  const rule = await findAllowRule({
    tool: 'memory.remember',
    thread: request.caller.thread,
    source: 'image',
  });

  if (rule?.source === 'image') return runRuleGate(parts, request, rule); // section E

  const tokens = await readTokenVerdict(parts, request);

  return review('from_photo', { tokens }); // always waits
}

// ---- D. The content gate ----

async function runContentGate(parts, request) {
  // Step 2. The hidden-character check, on the text and on each label.
  if (hasHiddenCharacter(request)) return review('invisible_character', { tokens: 'fail' });

  // Step 3. An allow rule on the write's tool.
  const tool = request.target === undefined ? 'memory.remember' : 'memory.edit';

  const rule = await findAllowRule({ tool, thread: request.caller.thread });

  if (rule !== null) return runRuleGate(parts, request, rule); // section E

  // Step 4. Evidence.
  if (request.quote === undefined) return review('no_quote', { quote: 'fail' });

  const found = await readEvidence(parts, request); // section F

  if (found.status === 'review') return review(found.reason, { quote: 'fail' });

  // Step 6. The token check: the text's tokens and the labels' tokens, against the quote.
  if (findMissingToken(collectCheckedText(request), request.quote) !== null) {
    return review('token_missing', { quote: 'pass', tokens: 'fail' }, found.evidence);
  }

  // Step 7. The checker: one model call. It gets your whole message with the quote and the
  // pasted spans marked, and the memory text. It never gets a label.
  const answer = await runMemoryChecker(parts, { text: request.text, found });

  if (answer === 'asserted') return pass({ quote: 'pass', tokens: 'pass' }, found.evidence);

  if (answer === 'not_asserted') return review('checker_not_asserted' /* checks */);

  if (answer === 'unsure') return review('checker_unsure' /* checks */);

  return review('checker_unreachable' /* checks */); // a timeout or an error
}

// The text that the hidden-character check and the token check read.
function collectCheckedText(request) {
  const labels = request.labels ?? {};

  return [request.text, labels.gist, labels.topic, ...(labels.triggers ?? [])]
    .filter(Boolean)
    .join('\n');
}

// ---- E. A write under an allow rule ----

async function runRuleGate(parts, request, rule) {
  // The rule skips the quote check and the checker. The token check reads everything you typed
  // in the window on the caller's thread.
  const typed = await readTypedText(parts, request.caller.thread, parts.limits.evidenceWindow);

  if (findMissingToken(collectCheckedText(request), typed) !== null) {
    return review('token_missing', { rule, tokens: 'fail' });
  }

  if (request.isPinned) return review('pinned', { rule, tokens: 'pass' });

  return pass({ rule, tokens: 'pass' });
}

// ---- F. Where the gate looks for the quote ----

async function readEvidence(parts, request) {
  if (request.eventID !== undefined) {
    // A cited event: read it on the thread that the caller may read.
    // The conversation and a task with `log: own`: logThread is the caller's own thread.
    // A task with `log: conversation`: logThread is the conversation's thread.
    // (open: gate quote thread) whether a grant that a step lost mid-step still counts.
    return readEventEvidence(parts.log, {
      thread: request.caller.logThread,
      quote: request.quote,
      eventID: request.eventID,
    });
    // no record at that ID on that thread -> 'no_quote'
    // a record that is not your message  -> 'quote_not_typed'
    // a message whose text is forgotten  -> 'forgotten_evidence'
    // then Step 5, the quote check: getTypedQuote on that one message
  }

  // No cited event: search your last `evidenceWindow` messages on the caller's own thread.
  return readQuoteEvidence(parts.log, {
    thread: request.caller.thread,
    quote: request.quote,
    window: parts.limits.evidenceWindow,
  });
  // a hidden character in the quote               -> 'invisible_character'
  // Step 5, the quote check, per message: getTypedQuote
  //   the match touches a pasted or dropped span   -> 'quote_not_typed'
  //   the match is in a blockquote, a code block,
  //   or a reply or forward header                 -> 'quote_in_quoted_block'
  //   no message holds the quote                   -> 'no_quote'
  // the message backed an item you forgot          -> 'forgotten_evidence'
}

// ---- G. A label-only edit ----

async function writeGatedLabelEdit(parts, request) {
  // request holds a target and labels, and no text.
  const item = await requireItem(parts, request.target);

  const labelText = collectCheckedText({ text: '', labels: request.labels });

  // 1. The hidden-character check on each label.
  if (invisible.test(labelText)) {
    return propose(request, review('invisible_character', { tokens: 'fail' }));
  }

  // 2. The token check against the item's own text. The gate reads no thread.
  const tokens = findMissingToken(labelText, item.text) === null ? 'pass' : 'fail';

  // 3. The edit waits with 'labels', whatever the token verdict. No allow rule is read.
  // 4. The checker does not run.
  return propose(request, review('labels', { tokens })); // section H: the cap counts it

  // 5. Your approval writes one `memory.labelled` record with exactly the reviewed labels.
  //    memory-labels.md owns that record and the approval flow.
}

// ---- H. A proposal, under the cap of its turn ----

async function writeProposalRecord(tx, parts, request, review) {
  const made = await countProposals(tx, request.capGroup); // the proposals of this turn

  if (made >= parts.limits.proposalCap) throw new ProposalCapError(parts.limits.proposalCap);

  await writeRecords(tx, buildProposalRecords(parts, request, review)); // `memory.proposed`
}

// ---- I. A pin ----

// writeGatedPin runs no check. An allow rule on `memory.pin` applies the pin at once.
// With no such rule the pin waits with 'pinned'.

// ---- J. The memory tools of a task start ----

function pickRefusedTools(asked, starterTools, bounds, memory) {
  const isMemoryTool = (tool) =>
    bounds.memoryTools.read.includes(tool) || bounds.memoryTools.write.includes(tool);

  const checks = [
    ['wider_tools', (tool) => !starterTools.includes(tool)], // a write tool the starter lacks
    ['conversation_tools', (tool) => bounds.conversationTools.includes(tool)],
    ['memory_tools', (tool) => isMemoryTool(tool) && memory !== 'read'], // read and write alike
  ];
  // The first check that matches a tool refuses the start. (open: start refusal text)
  // With `memory: read`, the task gets each read tool its starter holds, and each write tool
  // that the start names.
}

// ---- K. A step of a leftover task ----

// runOffTaskStep: read the task's inbox to its end, acknowledge each entry, write no record
// but the step's own, and start no model. A due timer of the task ends the same way.

// ---- L. An approval of a prompt proposal for a retired ID ----

async function approvePromptProposal(parts, proposal) {
  // proposal.promptID parses with storedPromptIDs.
  if (!promptIDs.includes(proposal.promptID)) {
    throw refusal(deletedPromptRefusal); // (open: deleted prompt refusal). Nothing is written.
  }
  // ...the built approval
}
// A rejection closes such a proposal. The prompt lapse sweep lapses it at its stored time.
// An override for a retired ID in the stored definitions in force is read and never rendered.
