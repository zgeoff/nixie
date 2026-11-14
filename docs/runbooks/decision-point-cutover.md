# Cutting over to the full decision point

Run these steps once on each deployment that upgrades to the release that puts the full
[decision point](../architecture/policy/decision-point.md) in force. Before the release, the fixed
read-only rule allowed reads, fetches and notes and denied everything else. After it, only the rules
in your definitions allow anything, and a call that no rule covers asks.

1. Copy `deploy/compose/definitions/rules/starter.yaml` into the `rules/` folder of your definitions
   repository, and set `format: 4` in `nixie.yaml`. The file keeps the rules you edit.
2. Start the new release. Expect: the first seed applies the asks at once and records one rule
   change proposal that holds the allows.
3. List the proposals.

   ```bash
   nixie proposals list
   ```

   Expect: one `rule_change` entry. Without it, the start log holds `policy.no_rules_in_force` and
   every call that you did not ask for in typed words waits for approval.

4. Read the allows, then approve the proposal.

   ```bash
   nixie proposals approve <proposalID>
   ```

   Expect: `nixie rules list` shows every starter rule.

5. Mark each destination that nixie may send to without asking as a known contact.

   ```bash
   nixie contacts mark-known <destination> --name <name>
   ```

   Expect: `nixie contacts list` shows the contact. A destination you typed in your message needs no
   mark.

An approved action does not run in this release. `nixie proposals approve` for an action records
your answer in the inbox of the task that asked, and the model reads that the action did not run.
Settings: `policy.consent.link_max_age`, in hours, sets how old a message that a task passed on may
be and still count as your consent. It defaults to 24.
