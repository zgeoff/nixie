# Rule conflicts and the rule export

- Decisions: [0013](../../../decisions/0013-definition-versioning.md),
  [0020](../../../decisions/0020-deployment.md#seeding),
  [0028](../../../decisions/0028-policy-design.md)

Rules change in 2 places: in your definitions repo, which the seed reads, and in nixie at runtime,
when you approve "always allow", accept a proposed rule, or edit or delete a rule in the client.
nixie handles both as it handles [skills](../skills.md): a runtime change stays in force, a repo
change to the same rule waits beside it as a conflict for you to resolve, and nixie exports every
runtime change to the repo in one rolling pull request.

## Conflicts

A seed that changes a rule that a runtime change overrides leaves the runtime change in force, and
shows the repo's version beside it as a conflict. The client and the CLI list each conflict with
both versions. You resolve it in one of 2 ways:

| Choice               | Effect                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------- |
| Keep nixie's rule    | The repo's version becomes the base of the runtime change, which stays in force and exported |
| Keep the repo's rule | nixie drops the runtime change, and the repo's version applies                               |

Each choice writes a record that names the rule and the choice. **Why:** a conflict means the repo
and nixie disagree, and only you know which one is right, so nixie never picks one alone.

## The rolling export

nixie keeps one pull request on one fixed branch, `nixie/rules`, that holds every runtime change in
force. Each change to that set rebuilds the branch on the newest commit of the repo's default
branch, and updates the pull request. When the set empties, because each change merged or was
dropped, nixie closes the pull request.

- A pull request opens for "always allow", for an accepted proposed rule, and for a runtime edit or
  delete.
- A pull request never opens for a one-off approval, a reject or a defer.
- A mandate never exports: it ends within a day, and the repo holds rules that last.
- Nothing waits on the merge. Each runtime change is in force when you make it, and the merge only
  makes your definitions hold it. The next seed after the merge finds the repo and nixie agree, and
  marks each rule as seeded.

The export edits your YAML in place, rule by rule, so the comments and the order of every rule it
leaves alone stay as you wrote them. A new rule goes at the end of `rules/nixie.yaml`. **Why:** one
branch keeps one review open however many changes you make, and an in-place edit keeps the diff to
the rules that changed.
