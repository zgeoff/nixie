# One proposal lifecycle, the rest

- **Status:** agreed, partly built

The [approvals doc](../../architecture/policy/approvals.md#one-lifecycle) describes what is built:
one row, one lapse sweep, one set of records for each outcome, and one note to the proposer, for
every family. This design covers what is left: the tools with which the proposer lists and withdraws
its proposals, one kind of short ID, and the clean-up of memory's own proposal state.

Once the owner approves this design, build each of its work items from it and the built
[approvals](../../architecture/policy/approvals.md) it extends.

## Terms

- A **family** is a type of proposal with its own body and its own effect: `action`, `memory`,
  `skill`, `rule_change`, `mcp` or `prompt`.
- The **proposer** is the conversation or the task whose thread the proposal was made on. A proposal
  that nixie makes on its own has no proposer. One such is a **suggested rule**: a rule nixie
  suggests after you approve the same kind of action several times.

## Contracts

### The pending tool

```ts
const open = await tools.call('proposals.pending', { by: 'tasks' });
// → [{ shortID: 'M3', family: 'memory', task: 'Weekly digest', change: 'add',
//      gist: 'Dentist moved to Tuesdays', topic: 'health', reason: 'a new fact about you',
//      state: 'deferred', lapsesAt: '2026-12-01T09:00:00Z' },
//    { shortID: 'K7', family: 'skill', task: 'Weekly digest',
//      sentence: 'Update the trip-planning skill', state: 'pending',
//      lapsesAt: '2026-12-03T09:00:00Z' }]

type PendingInput = {
  by?: 'me' | 'tasks'; // me: the caller's own; tasks: those of tasks it started; both when omitted
  family?: ProposalFamily;
  text?: boolean; // true adds the full proposed text to memory rows
};

type PendingRow = {
  shortID: string;
  family: ProposalFamily;
  task: string | null; // the proposing task's name; null for the caller's own
  state: 'pending' | 'deferred';
  lapsesAt: string;
} & (
  | {
      family: 'memory';
      // memory's change for a new item, 'new', shows as 'add'; edit, retire and pin keep their names
      change: 'add' | 'edit' | 'retire' | 'pin';
      gist: string | null;
      topic: string | null;
      reason: string; // why it waits for review
      text?: string; // only with text: true
    }
  | { family: Exclude<ProposalFamily, 'memory'>; sentence: string } // the card's one-line sentence
);
```

- `proposals.pending` lists open proposals, pending or deferred: those the caller is a proposer of,
  and those of every task the caller started itself, open or closed. A task that such a task started
  counts only for its own starter.
- It replaces `memory.pending`.
- `proposals.withdraw` takes a short ID and withdraws an open proposal that the caller is a proposer
  of. The result says the proposal is withdrawn, or that it is closed already.

### Short IDs

- Memory draws its short ID like every other family, and every reader of a memory proposal takes its
  short ID from the shared row. Today memory derives it from its UUID.
- A proposal's UUID never reaches the model. The answer path, `proposals.withdraw` and
  `approvals.readProposals` find a proposal by its short ID, and return the newest row that holds
  it. The approval card sends the UUID, so an older row that shares a short ID stays answerable.
- Old proposals keep the short IDs their rows already hold.
- Notices to the model mark a record with `[#n]`, an event number that `log.read` accepts. The
  take-over notices put a random short ID in that slot, which nothing can look up. Make them print
  their record's event number instead. `[#n]` means an event number and nothing else.

## Constraints

- When a memory proposal merges into an open one, the merged proposal's proposer hears the
  settlement of the open one, and its own short ID resolves to the open proposal.
- `memory_proposals` keeps each memory proposal's sealed body and its merges. Memory reads a
  proposal's state from the shared row. A migration drops the `status` and `lapse_at` columns.
- Rename "gap check" to "suggested rules" in the code, tables and records. Keep the old record
  codecs, so a rebuild still reads every old record.
- The notes of the published contract's minor release name the new forgettable kind
  `proposals.settled`.
- A rollback past the release that ships this design needs a restore from a backup taken before the
  upgrade.

## Builder decides

- How the work splits into pull requests.
- How `proposals.pending` renders a closed task's proposals.

## Out of scope

- A digest of settled proposals, which the [push notice design](push-notice.md) covers.
- Changes to what each family proposes or applies.
