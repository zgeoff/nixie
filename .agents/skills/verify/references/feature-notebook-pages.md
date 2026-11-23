# notebook-pages

Contents: [Journey](#journey), [End state](#end-state).

Read what the assistant wrote with the notebook tools on the notebook pages, which never edit a
note. `/notebook` lists the notes, newest edit first. A note's page at `/notebook/<note ID>` shows
its body, links and backlinks. A private note is absent until the user ticks "Show private", which
sets `?private=1` and writes nothing. Its body stays folded until the user presses Open, which
appends one `notebook.private_opened` record. Forget on a note's page removes the whole note, and so
does the assistant's `notebook.forget`.

Follow the steps in [Check a change](../SKILL.md#check-a-change) for this journey. Read that section
for the commands `up` and `done`, and for the `data` field of each command's JSON output.

Run this journey on `local` only. The scripted model writes the notes, and the preview's real model
would write others. On `preview`, skip this journey and run no `done`. In your reply, list the
feature as not verified on `preview`.

Before you start:

- When you have not run [sign-in-enrol](feature-sign-in-enrol.md) since `up`, run it first.
- Run this journey once per `up`. It leaves both notes forgotten.
- Before you run the journey again, even after a failed pass, run `bun verify up --restart` and
  `bun verify doctor`. Then run sign-in-enrol. `up --restart` starts nixie on a new, empty database.

## Journey

1. Record every later command of this journey under this feature. Then script the model's next turn.
   `--notebook` queues 2 `notebook.write` calls, the second with `isPrivate` set, and a
   `notebook.link` call from the private note to the first note. `--text` queues the reply after
   them.

   ```bash
   bun verify use --feature notebook-pages
   bun verify action script-reply --notebook '{"title":"Boiler notes","body":"The boiler trips after a cold night.","privateTitle":"Winter diary","privateBody":"Dear diary, it snowed."}' --text 'Both notes are in the notebook.'
   ```

   Expect: `data.replies` is 4, the 3 tool calls and the reply.

2. Send the message, and check that nixie stored the notes and the link:

   ```bash
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'Write down the boiler notes and a private diary entry.'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'Write down the boiler notes and a private diary entry.' --reply 'Both notes are in the notebook.'
   bun verify db query "select kind, count(*) as n from records where kind like 'notebook.%' group by kind order by kind"
   ```

   Expect: `conversation turn` exits 0. The query lists `notebook.linked` with `n` 1 and
   `notebook.note_written` with `n` 2, and no `notebook.private_opened`.

3. Open the notebook with the private toggle off, and open the first note:

   ```bash
   bun verify browser goto /notebook
   bun verify browser snapshot --until-text 'Boiler notes'
   bun verify browser click --role link --name 'Boiler notes'
   bun verify browser snapshot --until-text 'Version 1 of 1'
   ```

   Expect: the first snapshot shows the heading "Notebook", the unticked checkbox "Show private" and
   the link "Boiler notes", and no text "Winter diary" and no placeholder for it. The last shows the
   body "The boiler trips after a cold night.", "This note links to nothing." and "No note links
   here."

4. Tick "Show private", then open the private note and its body:

   ```bash
   bun verify browser goto /notebook
   bun verify browser check --role checkbox --name 'Show private'
   bun verify browser snapshot --until-text 'Winter diary'
   bun verify browser click --role link --name 'Winter diary'
   bun verify browser snapshot --until-text 'marked this note private'
   bun verify browser click --role button --name Open
   bun verify browser snapshot --until-text 'Dear diary, it snowed.'
   bun verify browser screenshot
   bun verify db query "select count(*) as opened from records where kind = 'notebook.private_opened'"
   ```

   Expect: the first snapshot shows the ticked checkbox and both links. The second shows the heading
   "Winter diary", the line "The assistant marked this note private. Its body is folded." and a
   button "Open", and no diary body. The last shows the body, a line that starts with "Opened" and a
   link "Boiler notes" under Links. The query's `opened` is 1. The screenshot is evidence for the
   reviewer.

5. Follow the link to the first note, and forget it:

   ```bash
   bun verify browser click --role link --name 'Boiler notes'
   bun verify browser snapshot --until-text 'Winter diary'
   bun verify browser click --role button --name Forget
   bun verify browser click --role button --name 'Forget for good'
   bun verify browser snapshot --until-text 'Key backups'
   bun verify db query "select count(*) as forgotten from records where kind = 'notebook.note_forgotten'"
   ```

   Expect: the first snapshot shows "Winter diary" under Backlinks, and the page kept the private
   toggle. The last shows "The note is forgotten." and a line that starts with "Key backups". The
   query's `forgotten` is 1.

6. Open the notebook again, and the private note that linked to the forgotten one:

   ```bash
   bun verify browser goto '/notebook?private=1'
   bun verify browser snapshot --until-text 'Winter diary'
   bun verify browser click --role link --name 'Winter diary'
   bun verify browser snapshot --until-text 'Gone (note)'
   ```

   Expect: the list shows the link "Winter diary" and no link "Boiler notes". The note's page shows
   "Gone (note)" in place of the link.

7. Script a turn in which the assistant forgets the private note. Read the note's short ID first:

   ```bash
   bun verify db query "select json_extract(payload, '$.shortID') as id from records where kind = 'notebook.note_written' and json_extract(payload, '$.shortID') not in (select json_extract(payload, '$.shortID') from records where kind = 'notebook.note_forgotten')"
   bun verify action script-reply --forget-note '<the id>' --text 'The diary note is forgotten.'
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'Forget the diary note.'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'Forget the diary note.' --reply 'The diary note is forgotten.' --wait-ms 60000
   bun verify browser goto '/notebook?private=1'
   bun verify browser snapshot --until-text 'No notes yet'
   bun verify db query "select json_extract(payload, '$.by') as by, count(*) as n from records where kind = 'notebook.note_forgotten' group by by order by by"
   ```

   Expect: the first query lists 1 note, the private one. The `conversation turn` exits 0, and the
   turn replies once because the note's cleanup starts only after the step that forgets the note has
   committed. The list shows "No notes yet" and no link "Winter diary". The last query lists
   `assistant` with `n` 1 and `user` with `n` 1.

## End state

- Step 2: the log holds 2 `notebook.note_written` records and 1 `notebook.linked` record, and no
  `notebook.private_opened` record.
- Step 3: with the toggle off, the list and the first note's page show no title of the private note,
  no link to it and no count.
- Step 4: the private note's page folds its body until Open. After Open, the body shows, and the log
  holds exactly 1 `notebook.private_opened` record.
- Step 5: the first note's page lists the private note under Backlinks, and after the forget it
  shows the forgotten line with the key backup state. The log holds 1 `notebook.note_forgotten`
  record.
- Step 6: the list holds only the private note, and its link to the forgotten note reads "Gone
  (note)".
- Step 7: the list shows "No notes yet". The log holds 2 `notebook.note_forgotten` records, one with
  `by` `user` and one with `by` `assistant`.
