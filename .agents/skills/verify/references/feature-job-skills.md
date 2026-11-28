# job-skills

Contents: [Journey](#journey), [End state](#end-state).

A job definition may list skills in its `task.yaml`. The job's task pins the listed skills on its
thread with a `skills.pinned` record, and leaves out a skill that the definitions hold and the
definition does not list. The job run gets the skill tools and the skill catalog for the pinned
skills only. The e2e suite `runtime-job-skills.test.ts` checks the run's tool list, its catalog and
the refusal of a skill off the list, which no journey command reads.

Run this journey on `local` only. It needs a start with `NIXIE_VERIFY_JOB_SKILLS=1`, which puts the
skills `tide-tables` and `bird-log` in the definitions, and a job named "Water the tomatoes" that
lists `tide-tables` and fires every 5 minutes. The journey opens no browser page.

Before you start, run `NIXIE_VERIFY_JOB_SKILLS=1 bun verify up --restart` and `bun verify doctor`.

## Journey

1. Record the next commands under this feature, and script the job run's reply:

   ```bash
   bun verify use --feature job-skills
   bun verify action script-reply --text 'The tomatoes are watered.'
   ```

   Expect: both commands exit 0, and `data.replies` is the number 1.

2. Move the clock forward, so the job's schedule fires:

   ```bash
   bun verify action advance-clock --minutes 5
   ```

   Expect: exit 0.

3. Check that the job run ended. The `task` command checks once, with no wait.

   ```bash
   bun verify task --name 'Water the tomatoes' --state waiting --record task.run_ended
   ```

   Expect: exit 0. On exit 1, the run can still be in its turn. Run the same command again, up to 5
   runs in all. After the fifth failed run, skip `done`, and report the entry from `data.tasks`.

4. Count the pins that name each skill:

   ```bash
   bun verify db query "select count(*) as pins from records where kind = 'skills.pinned' and payload like '%tide-tables%'"
   bun verify db query "select count(*) as pins from records where kind = 'skills.pinned' and payload like '%bird-log%'"
   ```

   Expect: both exit 0. The one row of the first query has `pins` 1, and the one row of the second
   has `pins` 0.

## End state

The feature works when the job's task pinned `tide-tables` and left `bird-log` out:

- In step 4, the first query counted 1 `skills.pinned` record that names `tide-tables`.
- In step 4, the second query counted no record that names `bird-log`.

Once the end state matches, run `bun verify done`. When a command fails, follow its row in
[Exit codes](exit-codes.md). When a command exits 0 but the app differs from the end state, such as
a pin that names `bird-log` or no pin at all, skip `done` and report the feature with the `data` you
got.
