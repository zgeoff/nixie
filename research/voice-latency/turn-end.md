# End of turn on real speech

This run measures how often each end-of-turn detector ends a voice turn before the speaker has
finished, and how long it waits after a real end, on 600 real utterances played in real time on the
deployment host. At the agreed wait settings, no candidate cuts off fewer than 5% of the meeting
speech. On task calls and home-assistant commands, Clef-flash, Jev and both combined candidates
pass. Jev passes with the shortest waits: on task calls it cut off 2.5% and waited 838 ms after a
real end at the median and 1062 ms at the 90th percentile.

The hosted detectors gain little over a longer silence on task calls, because their answer takes 570
to 810 ms and the turn never ends before the answer arrives. Their gain is on hesitant speech, where
a silence long enough to stop the cut-offs waits over a second every time.

## Question

Which end-of-turn detector cuts off the fewest real utterances while it waits least after a real
end, on the deployment host? The pass line is fewer than 5% of real utterances cut off, with the
median and the 90th percentile of the wait reported beside each rate.

## Answer

- Nothing passes on the meeting speech at the agreed settings. Clef-flash comes closest at 6.5%.
- Clef-flash, Jev and both combined candidates pass on the task calls and the home-assistant
  commands. Silence at 500 ms and Smart Turn pass only on the commands.
- Jev waits 220 to 290 ms less than Clef-flash at the median on every set. Clef-flash cuts off
  fewer: 0.5% against 2.5% on the task calls.
- Averaging Smart Turn with a text detector cuts off more than the text detector alone on every set.
- A replay of the same recordings with a 1600 ms maximum wait brings Jev under 5% on all 3 sets, at
  1350 ms median and 1836 ms p90 on the meeting speech.

Recommendation: Jev alone, with the maximum wait at 1200 ms for task-like speech. Raise the maximum
wait to about 1600 ms only if the speech nixie hears hesitates like the meetings do, and measure
that on nixie's own turns first, because the 1600 ms figure comes from tuning on these recordings.
On hesitant speech, Clef-flash matches Jev's wait at the same cut-off rate. A silence of 700 to 1000
ms is the near match on task calls with no hosted dependency.

## Run it

Run from this directory, with the Cloudflare and TypeSafe credentials read straight into the command
or added by a broker.

```bash
bun install
./models.sh
bun real-speech.ts
bun download-speech-set.ts --set hvb
bun download-speech-set.ts --set slurp
bun turn-end.ts --set ami
bun turn-end.ts --set hvb
bun turn-end.ts --set slurp
bun report-turn-end.ts results/turn-end-*.jsonl
```

`report-turn-end.ts` replays the recorded answers, so `--max-wait`, `--min-wait` and `--silence` try
other settings with no new calls.

## Setup

| Component        | Version                                                                  |
| ---------------- | ------------------------------------------------------------------------ |
| Host             | an imp on the deployment host, with 4 AMD EPYC vCPUs and 2 GiB of memory |
| Bun              | 1.4.3                                                                    |
| sherpa-onnx      | `sherpa-onnx-node` 1.13.8, for Silero and Moonshine base int8            |
| onnxruntime-node | 1.30.0, for Smart Turn                                                   |
| Smart Turn       | v3.2, the CPU build                                                      |
| Clef-flash       | `@cf/cloudflare/clef-flash` on Workers AI                                |
| Jev              | `jev-latest`, which resolved to `jev-1.14.0`                             |

Every number comes from scripts that ran inside the imp, so the hosted calls took the deployed
network path. The imp's credential broker added each hosted key to its requests, and no key entered
the imp.

### Candidates

| Candidate                 | Reads                                   | Runs                  |
| ------------------------- | --------------------------------------- | --------------------- |
| Silence at 500 ms         | the pause length alone                  | on the host           |
| Smart Turn v3.2           | the last 8 s of audio                   | on the host, CPU      |
| Clef-flash                | the transcript so far                   | hosted, on Workers AI |
| Jev                       | the transcript so far                   | hosted, by TypeSafe   |
| Smart Turn and Clef-flash | both, with the 2 probabilities averaged | both                  |
| Smart Turn and Jev        | both, with the 2 probabilities averaged | both                  |

Clef-flash and Jev take the same request: a state that holds the transcript, and one yes-or-no
question on whether the person has finished. Both return a probability. Deepgram Flux, which ends
the turn inside its own hosted speech-to-text, is not in the run.

### Method

[`turn-end.ts`](turn-end.ts) plays each utterance in real time through Silero voice activity
detection with a 200 ms pause, one 32 ms window at a time, each at the moment its last sample ends.
When Silero closes a segment, the runner asks every detector at once and records each answer with
the time it arrived, counted from the end of the speech before the pause. A 2 s tail of faint noise
follows each utterance, because Silero holds a segment open longer over digital silence than over a
microphone's noise floor.

[`report-turn-end.ts`](report-turn-end.ts) replays each candidate over those records. At each pause,
a detector's probability sets the wait: 200 ms when it is sure the turn ended, rising in a straight
line to 1200 ms when it is sure it has not. The turn never ends before the slowest answer arrives,
so a hosted detector's wait is at least its answer time. The turn ends at the first pause whose wait
runs out before speech resumes.

A candidate cuts off an utterance when it ends the turn before the utterance's last speech segment.
Speech that resumes after the end never rejoins the turn, so each rate is the strict count. The wait
runs from the end of the last speech to the end of the turn, counted from the clip's own end when
Silero holds the segment past it. 4 clips held no speech segment, so they have no turn, which leaves
199 meeting utterances and 197 task calls.

The text detectors read a Moonshine transcript of the audio heard so far, lowercased with its
punctuation stripped, so that a full stop never gives away the end of the turn. Moonshine runs once
per pause, and its time counts in both text detectors' answer times. The streaming Zipformer
returned empty text at the pause on most task-call and meeting clips, so it reads nothing here. The
task calls are 8 kHz telephone audio sampled up to 16 kHz, which is the likely reason.

Smart Turn and Moonshine take 2 threads each, so that neither waits on the other for the imp's 4
vCPUs.

### Speech

Each set holds 200 utterances from its test split, taken in pages spread across the split. No set
holds synthetic speech.

| Set                      | Speech                                        | Kept            | Median length | Licence            |
| ------------------------ | --------------------------------------------- | --------------- | ------------- | ------------------ |
| AMI, headset microphones | meetings, with many hesitations               | 8 or more words | 4.5 s         | CC BY 4.0          |
| Harper Valley Bank       | the caller's side of simulated bank calls     | 6 or more words | 2.6 s         | CC BY 4.0          |
| SLURP                    | spoken commands to a home assistant, one each | 4 or more words | 2.9 s         | audio CC BY-NC 4.0 |

The licences come from each source:

- The AMI meeting corpus, from the University of Edinburgh, is under CC BY 4.0 by its licence page
  and its Hugging Face card, `edinburghcstr/ami`.
- Harper Valley Bank, from Gridspace and Stanford, comes through SLUE phase 2 (`asapp/slue-phase-2`,
  the `hvb` config), whose card keeps the original CC BY 4.0. The Gridspace repository's licence
  file says the same.
- SLURP, from Emotech, puts its text under CC BY 4.0 and its audio under CC BY-NC 4.0, by the
  licence file in its repository and its Zenodo record. The run reads the copy at
  `marcel-gohsen/slurp`. The SLURP figures here are aggregate measurements of non-commercial audio,
  and the repo's licence passes on no right in that audio.

SpokenWOZ stays out: its audio rows hold whole calls with no dialogue ID, so they cannot be matched
to the turn timings that would cut them into utterances.

## Results

### At the agreed settings

The wait runs from 200 ms when sure to 1200 ms when unsure. The wait columns cover only the
utterances heard whole, and every call answered, so no row has a failure.

| Candidate                 | Speech             | Utterances | Cut off    | Wait, median / p90 (ms) |
| ------------------------- | ------------------ | ---------- | ---------- | ----------------------- |
| Silence at 500 ms         | AMI                | 199        | 64 (32.2%) | 668 / 984               |
| Silence at 500 ms         | Harper Valley Bank | 197        | 15 (7.6%)  | 704 / 750               |
| Silence at 500 ms         | SLURP              | 200        | 2 (1.0%)   | 500 / 652               |
| Smart Turn v3.2           | AMI                | 199        | 37 (18.6%) | 730 / 1410              |
| Smart Turn v3.2           | Harper Valley Bank | 197        | 17 (8.6%)  | 561 / 1238              |
| Smart Turn v3.2           | SLURP              | 200        | 7 (3.5%)   | 339 / 768               |
| Clef-flash                | AMI                | 199        | 13 (6.5%)  | 1286 / 1692             |
| Clef-flash                | Harper Valley Bank | 197        | 1 (0.5%)   | 1131 / 1376             |
| Clef-flash                | SLURP              | 200        | 0 (0.0%)   | 875 / 1185              |
| Jev                       | AMI                | 199        | 15 (7.5%)  | 1060 / 1486             |
| Jev                       | Harper Valley Bank | 197        | 5 (2.5%)   | 838 / 1062              |
| Jev                       | SLURP              | 200        | 0 (0.0%)   | 652 / 940               |
| Smart Turn and Clef-flash | AMI                | 199        | 25 (12.6%) | 1102 / 1566             |
| Smart Turn and Clef-flash | Harper Valley Bank | 197        | 3 (1.5%)   | 968 / 1250              |
| Smart Turn and Clef-flash | SLURP              | 200        | 2 (1.0%)   | 763 / 1021              |
| Smart Turn and Jev        | AMI                | 199        | 27 (13.6%) | 958 / 1446              |
| Smart Turn and Jev        | Harper Valley Bank | 197        | 7 (3.6%)   | 802 / 1035              |
| Smart Turn and Jev        | SLURP              | 200        | 2 (1.0%)   | 593 / 801               |

Silence at 500 ms cut off 32.2% of the meeting speech, in line with the 30.5% that the
[pause test on the deployment host](deployment-host.md) found on the same corpus.

### Answer times

Each time runs from the end of the speech before a pause to the detector's answer, over the 870
pauses of the run. Silero closes a segment 200 ms after the speech ends, so no answer comes sooner.

| Detector   | AMI, median / p90 (ms) | Harper Valley Bank | SLURP     |
| ---------- | ---------------------- | ------------------ | --------- |
| Smart Turn | 320 / 363              | 327 / 356          | 325 / 346 |
| Clef-flash | 813 / 1057             | 722 / 894          | 702 / 884 |
| Jev        | 630 / 803              | 579 / 684          | 570 / 651 |

Jev answers 130 to 180 ms sooner than Clef-flash at the median, and that gap sets most of the
difference in their waits at the agreed settings.

### Longer silences and maximum waits

These rows replay the same recordings at other settings, so they show the trade-off and are no
independent test. A maximum wait chosen on these rows fits these recordings.

| Candidate          | Maximum wait | AMI cut off | AMI wait    | Harper Valley Bank cut off | Harper Valley Bank wait | SLURP cut off | SLURP wait  |
| ------------------ | ------------ | ----------- | ----------- | -------------------------- | ----------------------- | ------------- | ----------- |
| Silence at 700 ms  | none         | 23.6%       | 868 / 1172  | 2.5%                       | 904 / 952               | 1.0%          | 700 / 852   |
| Silence at 1000 ms | none         | 9.0%        | 1182 / 1530 | 0.5%                       | 1204 / 1252             | 0.0%          | 1000 / 1152 |
| Clef-flash         | 1600 ms      | 1.5%        | 1623 / 1985 | 0.0%                       | 1410 / 1747             | 0.0%          | 996 / 1547  |
| Jev                | 1600 ms      | 2.5%        | 1350 / 1836 | 0.5%                       | 914 / 1289              | 0.0%          | 731 / 1208  |
| Jev                | 2000 ms      | 2.0%        | 1622 / 2210 | 0.5%                       | 992 / 1534              | 0.0%          | 776 / 1496  |

Each wait is the median and the 90th percentile in milliseconds. On the task calls, silence at 700
ms matches Jev's cut-off rate at the agreed settings with a 66 ms longer median wait, and Jev at
1600 ms matches Clef-flash's 0.5% at the agreed settings with a 217 ms shorter one. On the meetings,
Jev at 2000 ms and Clef-flash at 1600 ms cut off 2.0% and 1.5% with the same median wait, so on
hesitant speech Jev's faster answer buys no shorter wait.

### Cost

The run made 870 calls to each hosted detector, with no failure. Clef-flash took about 224 input
tokens a call and Jev about 354, and neither bills output. At the published rates of $0.038 and
$0.042 per million input tokens, each detector costs under $0.02 per 1,000 pauses, so cost does not
separate them.

## Untested

- nixie's own turns, which may hesitate like the meetings or not.
- A detector rule other than the average, such as ending the turn only when both detectors agree.
- A streaming transcript sent before the pause, which would take Moonshine's time out of the answer.
- The resume rule, which joins speech that comes back within a second to the turn it follows.
- The far-field microphone of a room device, where every set here is close-talk or telephone audio.
