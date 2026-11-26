# calendar-tools

Contents: [Journey](#journey), [End state](#end-state).

With a connected Google account, the assistant lists and reads its events with the `calendar` tools.
Each result that holds an event's words counts as outside content. An invitation, a change or a
cancel of an event that has guests passes the decision point like any other send: when a guest has
no permission, nixie holds the call on a card, and Google emails the guests once you approve. A call
for an event with no guests reaches no one, and asks Google to email no one.

Follow the steps in [Check a change](../SKILL.md#check-a-change) for this journey. Read that section
for the commands `up` and `done`, and for the `data` field of each command's JSON output. When a
command in a step fails, follow its row in [Exit codes](exit-codes.md), then start the journey again
as "Before you start" describes.

Run this journey on `local` only. There, the test build reaches Google's endpoints at a fake Google
that the harness serves. The fake holds one event, "Team standup", and no other. `preview` and
`prod` reach the real Google. On them, skip this journey and run no `done`. In your reply, list the
feature as not verified there.

Before you start:

- When you have not run [sign-in-enrol](feature-sign-in-enrol.md) since `up`, run it first.
- Run this journey once per `up`, because a deployment registers one client and the card of step 6
  must be the only held call. Before you run it again, even after a failed pass, run
  `bun verify up --restart` and `bun verify doctor`. Then run sign-in-enrol. Run this journey and
  [drive-tools](feature-drive-tools.md) in either order, with that restart between them.

## Journey

1. Record every later command of this journey under this feature. Then register the OAuth client and
   connect the account, as in steps 1 to 3 of [google-connections](feature-google-connections.md):

   ```bash
   bun verify use --feature calendar-tools
   bun verify browser goto /settings/connections
   bun verify browser type --role textbox --name 'Client ID' --value 'verify-client.apps.test'
   bun verify browser type --label 'Client secret' --value 'verify-secret-value'
   bun verify browser click --role button --name 'Register the client'
   bun verify browser snapshot --until-text 'Secret fingerprint'
   bun verify browser click --role button --name 'Connect a Google account'
   bun verify browser snapshot --until-text 'Scopes granted'
   ```

   Expect: the snapshot's heading is `verify@example.test`, with the status "Active".

2. Script the model's next turn: it lists the events of the lunch hour, invites a guest to a new
   event, and then answers.

   ```bash
   bun verify action script-reply --text 'The invitation waits for your approval.' --calendar-invite '{"title":"Lunch with Lee","start":"2026-12-02T12:00:00+11:00","end":"2026-12-02T13:00:00+11:00","guest":"lee@example.org"}'
   ```

   Expect: `data.replies` is 3.

3. Send the message:

   ```bash
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'Invite Lee to lunch on Wednesday.'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'Invite Lee to lunch on Wednesday.' --reply 'The invitation waits for your approval.'
   ```

   Expect: `conversation turn` exits 0.

4. Check the calls that the model made. The list's result is `result`, and the invitation's is
   `queued`, with no action yet.

   ```bash
   bun verify db query "select json_extract(payload, '$.outcome') as outcome from records where kind = 'tool_result' and thread = 'conversation' order by sequence"
   bun verify proposals --tool calendar.create_event_with_guests --waiting pending
   bun verify calendar written --count 0
   ```

   Expect: the last 2 rows of `data.rows` have `outcome` `result` and `queued`. `proposals` and
   `calendar written` exit 0: the fake Calendar took no write yet.

5. Script a text reply for the turn that the call's outcome starts, then open the approvals page:

   ```bash
   bun verify action script-reply --text 'The invitation is sent.'
   bun verify browser goto /proposals
   bun verify browser snapshot
   ```

   Expect: one collapsed item under "Routine", in the group "Conversation". It reads
   `Invite lee@example.org to "Lunch with Lee" on Wed 2 Dec 2026, 12:00 Sydney` and holds a checkbox
   "Select".

6. Expand the item, check its card, and approve it. For `<item_ref>`, pass the `ref` of the line in
   the step 5 snapshot that holds the item's text and `[cursor=pointer]`. Take no other snapshot
   before the first click, because each snapshot gives every element a new `ref`.

   ```bash
   bun verify browser click --ref '<item_ref>'
   bun verify browser snapshot
   bun verify browser click --role button --name 'Send invitations'
   ```

   Expect: the card shows the fields `title` "Lunch with Lee", `start` and `end` in the user's zone,
   `guests` `lee@example.org (no permission)`, `connection` and `calendar` `primary`. The approve
   button reads "Send invitations", beside "Defer" and "Decline". Both clicks exit 0.

7. Check that the invitation went out once, with the email to its guest:

   ```bash
   bun verify proposals --tool calendar.create_event_with_guests --waiting none
   bun verify db query "select state from proposals where family = 'action'"
   bun verify db query "select json_extract(payload, '$.status') as status from records where kind = 'action.outcome' and json_extract(payload, '$.tool') = 'calendar.create_event_with_guests'"
   bun verify calendar written --count 1 --send-updates all --guest lee@example.org
   ```

   Expect: `proposals` exits 0. The first query returns one row with `state` `approved`. The second
   returns one row with `status` `done`. `calendar written` exits 0: the fake Calendar took exactly
   one write, which asked Google to email the guests and holds `lee@example.org`. It fails with
   `check-failed` for a double write, for no write, for a write that emails no one, and for another
   guest.

## End state

- Step 4: the model listed the events and asked to invite the guest. The invitation was held, and
  the fake Calendar took no write.
- Step 6: the card shows the whole event and its guest, who has no permission.
- Step 7: the invitation is approved and its action is done, and the fake Calendar holds one write
  that emails the guests.

When steps 4, 6 and 7 all match, run `bun verify done`, as in
[Check a change](../SKILL.md#check-a-change).
