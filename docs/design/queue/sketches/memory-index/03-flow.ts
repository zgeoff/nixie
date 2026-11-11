// Memory index: each flow as commented code. Not compiled. No package imports this file.
// The docs that point here: memory-labels.md, memory-revision.md, memory-index.md,
// memory-recall.md, memory-turn-push.md. Usage: 01-usage.ts. Types: 02-types.ts.
// These names are agreed: requireItem, readMatchingProposal, buildProposalHash, readRecall,
// selectTurnMemory, pickTurnPushes, buildPushExclusions, readTurnMemory, placeTurnMemory.
// Every other function name here is this sketch's own.

// ---- A. The stale check and the 2 numbers ----

// requireItem is the one stale check. Every tool input and every API target passes the revision.
function requireItem(row: MemoryItemRow, given: number): MemoryItemRow {
  const revision = row.version + row.label_edits;

  if (given !== revision) {
    throw new StaleVersionError(revision); // the error names the current revision
  }

  return row; // every step after this reads row.version, the text version
}

// ---- B. One function writes the item label record ----

// Every path calls it: a remember, an edit, an approval and the backfill.
function writeLabelsInTransaction(transaction, write: LabelWrite) {
  // 1. Seal { gist, topic, triggers } under the item's key, at `labels/<itemID>/<revision>`.
  // 2. Append memory.labelled with the whole label set.
  //    - "written": in the commit of a memory.version_added, with that version's revision.
  //    - "edited": adds 1 to label_edits. It writes no version.
  //    - "backfilled": the item's revision at that moment. It moves no number.
  // 3. Insert the memory_labels row.
  // 4. Update the item's gist, topic and trigger entries in the store's in-memory item index.
}

// ---- C. A write that carries labels, from the call to the record ----

// The gate's checks and reasons: memory-write-gate.md. This section holds the records only.
async function writeWithLabels(call) {
  if (call.text !== undefined && isApplied(call)) {
    // One transaction: memory.version_added and memory.labelled ("written").
    // A text edit that passes no label writes the version alone.
  }

  if (call.text !== undefined && isHeld(call)) {
    // One transaction: memory.proposed and memory.proposal_labelled.
    // For an item not yet written, the proposal creates the item's ID and key, and
    // targetRevision is null.
  }

  if (call.text === undefined) {
    // A label-only edit. One transaction: memory.proposed (02-types.ts, section F) and
    // memory.proposal_labelled with isLabelOnly: true. The item's row is untouched.
    // A task's proposal holds the origin "task" and the task's ID.
  }
}

// The duplicate check, readMatchingProposal.
function isSameProposal(pending, incoming): boolean {
  const isSameText =
    pending.operation === incoming.operation &&
    pending.itemID === incoming.itemID &&
    pending.targetVersion === incoming.targetVersion &&
    pending.text === incoming.text;

  if (incoming.labels === null) return isSameText;

  return isSameText && isEqualLabelSet(pending.labels, incoming.labels); // the 2 whole sets
}

// The proposal hash, buildProposalHash.
function hashInputs(proposal) {
  // With a proposal label record: the text inputs, the labels, targetRevision and isLabelOnly.
  // With none: the text inputs alone.
  // With a memory.proposal_sensitive_noted record in the log: the flag too, read from that record.
}

// ---- D. The approval of a proposal ----

function approveProposal(proposal, row: MemoryItemRow) {
  const revision = row.version + row.label_edits;

  if (proposal.labelRecord !== null) {
    if (
      proposal.labelRecord.targetRevision !== null &&
      proposal.labelRecord.targetRevision !== revision
    ) {
      return refuseAsStale(); // the labels and the text that moved are untouched
    }
  } else if (proposal.targetVersion !== row.version) {
    return refuseAsStale();
  }

  if (proposal.labelRecord?.isLabelOnly) {
    // One memory.labelled with change "edited" and exactly the reviewed labels. No version.
    return;
  }
  // A version, and beside it one memory.labelled ("written") when the proposal holds labels.
}

// ---- E. The index block ----

// The memory module renders and counts. It reads the store's in-memory label entries.
function renderIndex(entries: LabelEntry[], config): SessionIndex {
  if (config.index_tokens === 0) return emptyIndex(); // no block
  // 1. Take every active item that is not pinned.
  // 2. Group by subject (the person's items, shared items, the agent's self-notes), then by
  //    topic. 2 topics that differ only by case are one topic, spelled as its newest item spells it.
  // 3. Order the items of a topic by index_item_order.
  // 4. Count every rendered line: the opening line, headings, item lines, folded topic lines and
  //    the closing line.
  // 5. While the count is over index_tokens and an open topic exists: fold one topic to
  //    foldedTopicLine. index_fold_order picks it. "largest-first": the open topic with the most
  //    items. "oldest-first": (open: fold order)
  // 6. While the count is over index_tokens: drop the smallest topic into closingLine.
  // 7. Return the text and the counts. Append no record.
}

// ---- F. memory.recall ----

async function recall(input: RecallInput): Promise<RecallOutput> {
  // 1. Refuse a call with 2 of query, itemIDs, topic and topics, and each pairing that
  //    02-types.ts, section H marks as refused. A refused call writes nothing.
  // 2. topic or topics: read the store's in-memory label entries for the active items that are
  //    not pinned, apply `subjects`, start after `after`, take at most index_topic_page lines,
  //    then cut to the page limit. Return `lines` or `topics`, with `next` at the first entry
  //    the page omits. Append no record.
  // 3. query, itemIDs or the plain list: hand the store the request with the byte budget and
  //    the measuring function (02-types.ts, section J).
  // 4. Build `searched` from the input. Add `leftOut` when the result omits an entry.
  // 5. A result with no entry: the empty list of its kind, `searched`, and no record.
}

// The store, in readRecall, under the delivery lock, after the filters and before the record.
async function capRecall(items: RecalledItem[], request: RecallRequest & RecallBudget) {
  // For named IDs, first keep the first `limit` items. The IDs past `limit` count as omitted.
  if (request.byteBudget === undefined) return recordAndReturn(items); // no cap

  const kept: RecalledItem[] = [];
  let bytes = 0;

  for (const item of items) {
    const size = await request.measureItem(item); // a rejection ends the recall: no record

    const next = bytes + size + (kept.length > 0 ? 1 : 0); // one byte for the comma

    if (kept.length > 0 && next > request.byteBudget) break; // the kept items are a leading run

    kept.push(item); // the first item is always kept

    bytes = next;
  }
  // memory.recall.checked, the fault point, sits here.
  // Append memory.recalled for the kept item versions only.
  // Return the kept items, the omitted IDs in order, and for the plain list the cursor of the
  // last kept item.
}

// ---- G. A first item that passes the budget alone ----

function fitFirstItem(item, budget) {
  // 1. The store returns the item's current version and the newest versions of its history that
  //    fit.
  // 2. The tool drops the item's moment links from the end until the result fits.
  // 3. The record lists the returned versions only. leftOut.versions counts the rest.
  // 4. A current version alone holds a text and a quote of at most 2,000 characters each. When it
  //    alone passes the budget, the store returns it whole and records it. The harness cuts a
  //    result to 48,000 characters, which such an item never reaches.
}

// ---- H. What memory a turn brings ----

async function selectTurnMemory(sources, settings, ask): Promise<TurnSelection> {
  // Appends nothing.
  const pushes = pickTurnPushes(settings); // the pushes that are on; trigger push is on above 0

  if (pushes.length === 0) return { kind: 'none' }; // before any read

  if (ask.text.trim() === '') return { kind: 'none' }; // before any read

  const states = await sources.readItemStates();
  const held = await ask.held.readVersions();

  // The one place that decides it: a lapsed item, a pinned item, and an item whose current text
  // version the session holds.
  let excludedIDs = buildPushExclusions(states, held);
  const picks: PushPick[] = [];

  for (const push of pushes) {
    const selection = await push(sources, { ...ask, states, excludedIDs }); // its own cap and floor

    picks.push(...selection.picks);

    excludedIDs = [...excludedIDs, ...selection.picks.map((pick) => pick.itemID)];
  }

  return picks.length > 0 ? { kind: 'selected', picks, messages: [] } : { kind: 'none' };
}

// Trigger push, the one SelectPush.
async function selectTriggerPush(sources, turn): Promise<PushSelection> {
  // sources.triggers.readMatches(turn.text, {
  //   limit: trigger_items, minScore: trigger_min_score,
  //   excludedIDs: turn.excludedIDs, excludedWords: turn.excludedWords,
  // })
  // One match per item, scored by its best trigger phrase. Self-notes share the cap.
  // With no encoder, the search is by keyword only.
}

async function readTurnMemory(parts, settings, ask): Promise<TurnMemory> {
  const selection = await selectTurnMemory(sourcesOf(parts), settings, ask);

  if (selection.kind === 'none') return { kind: 'none' };

  return placeTurnMemory(parts, ask, selection);
}

async function placeTurnMemory(parts, ask, selection): Promise<TurnMemory> {
  // Under the delivery lock:
  // 1. Load the picks, in their order.
  // 2. Drop a pick that is pinned, retired or forgotten since the ranking. Refill nothing.
  // 3. With no pick and no message: return { kind: "none" } and append nothing.
  // 4. Append one memory.recalled record: references, scores and the search mode. It holds no
  //    text and no trigger phrase, and it does not say which push placed an item.
  // 5. Return the items for the retrieved-memory block and the self-notes for the
  //    retrieved-self-notes block.
}

// A rejection of a search or of a read of the log rejects the ask. No function here catches.
