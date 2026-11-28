# job-skills

Contents: [Journey](#journey), [End state](#end-state).

A job definition may list skills in its `task.yaml`. The job's task pins the listed skills on its
thread with a `skills.pinned` record, and leaves out a skill that the definitions hold and the
definition does not list. The job run gets the skill tools and the skill catalog for the pinned
skills only. The pin records are written before the model's turn, so they show nothing of the tools
or the catalog. In this journey, the job run calls `skill_read` for a skill on the list and one off
it, and you check the outcome of each call and the catalog in the system prompt.

Run this journey on `local` only. It needs a start with `NIXIE_VERIFY_JOB_SKILLS=1`, which puts the
skills `tide-tables` and `bird-log` and a job named "Water the tomatoes" in the definitions. The job
lists `tide-tables` and fires every 5 minutes. The journey opens no browser page.

Before you start, run `NIXIE_VERIFY_JOB_SKILLS=1 bun verify up --restart` and `bun verify doctor`.

## Journey

1. Record the next commands under this feature, and script the job run's reply, which reads both
   skills first:

   ```bash
   bun verify use --feature job-skills
   bun verify action script-reply --text 'The tomatoes are watered.' --skill-read '{"names":["tide-tables","bird-log"]}'
   ```

   Expect: both commands exit 0, and `data.replies` is the number 3.

2. Move the clock forward, so the job's schedule fires:

   ```bash
   bun verify action advance-clock --minutes 5
   ```

   Expect: exit 0.

3. Check that the job run ended. The `task` command checks once, with no wait.

   ```bash
   bun verify task --name 'Water the tomatoes' --state waiting --record task.run_ended
   ```

   Expect: exit 0. On exit 1, the job run can still be in its turn. Run the same command again, up
   to 5 times in all. After the fifth failure, skip `done`, and report the entry from `data.tasks`.

4. Count the pins that name each skill:

   ```bash
   bun verify db query "select count(*) as pins from records where kind = 'skills.pinned' and payload like '%tide-tables%'"
   bun verify db query "select count(*) as pins from records where kind = 'skills.pinned' and payload like '%bird-log%'"
   ```

   Expect: both exit 0. The one row of the first query has `pins` 1, and the one row of the second
   has `pins` 0.

5. Read the outcome of each skill call, in the order the job run made them. The query leaves out the
   results of the queue check that nixie runs at each start:

   ```bash
   bun verify db query "select json_extract(payload, '$.outcome') as outcome from records where kind = 'tool_result' and thread = (select thread from records where kind = 'trigger.fired' order by sequence limit 1) order by sequence"
   ```

   Expect: exit 0, and 2 rows. The first has `outcome` `result`, for `tide-tables`, and the second
   has `outcome` `error`, for `bird-log`, which is off the list.

6. Check that the catalog of the listed skill reached the model:

   ```bash
   bun verify model input --in-system --contains 'tide-tables: Reads a tide table.'
   ```

   Expect: exit 0.

## End state

The feature works when the job's task pinned `tide-tables` and left `bird-log` out:

- In step 4, the first query counted 1 `skills.pinned` record that names `tide-tables`.
- In step 4, the second query counted no record that names `bird-log`.
- In step 5, the job run read `tide-tables` and got an error for `bird-log`.
- In step 6, the system prompt of the job run's last request held the catalog line of `tide-tables`.

Once the end state matches, run `bun verify done`. When a command fails, follow its row in
[Exit codes](exit-codes.md). When a command exits 0 but the app differs from the end state, such as
a pin that names `bird-log`, no pin at all, a second row that is not `error`, or a system prompt
with no catalog line, skip `done` and report the feature with the `data` you got.
