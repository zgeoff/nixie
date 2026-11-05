# Spike results: the memory each turn brings

This measurement follows [retrieval on real turns](real-turns.md) on a later snapshot of the same
deployment. It counts what each memory block adds to a turn, scores each block on labels from the
deployment's own assistant, and tests changes to the retrieval rules on a held-out half of those
labels. The data is the user's own and never enters the repo: the harness reads a plain export from
a folder outside it and prints counts and scores only.

Each sentence that states a fact ends with how it is known:

- [measured]: a harness command on the snapshot.
- [one-off script]: a script that ran once on the snapshot through the harness's own modules. The
  repo does not hold it, because it names private items.
- [read in the code]: the product code.
- [from a record]: an earlier report, an issue or the rater's notes.
- [guess]: a reading the data does not settle.

## Questions

1. How many tokens does each block add per turn, and which block carries most of the noise? This
   informs which block to cut or gate first.
2. Which of the assistant's proposed fixes cut noise without losing the items a turn needed, on
   turns that the choice of fix never saw? This informs the next retrieval change.
3. How much of the noise comes from the keyword (BM25) list, and does its weight or its floor fix
   it? This informs whether to tune BM25 or the floors.
4. Do a few items show on many unrelated turns, and does a hub correction help? This informs whether
   retrieval needs a correction per item.
5. Should the sensitive flag stay, narrow or go? This informs the flag's rule.
6. How far do the scores rest on one rater? This informs how much weight each change can bear.

## Setup

Run the commands from the spike's directory, with the same `<plain>` and `<names>` as
[the real-turn setup](real-turns.md#setup), and `<out>` a folder outside the repo for the sample.

```bash
bun real-turns.ts blocks --plain <plain>
bun real-turns.ts rating-sample --plain <plain> --names <names> --out <out> --size 286
bun real-turns.ts score --plain <plain> --names <names> --labels <out>/labels --key <out>/sample-key.jsonl \
  --sample <out>/sample.jsonl --exclude <case ranges> --held <case ranges> --missing <missing map>
```

- `--exclude` drops the labels of the listed turns, `--held` counts every listed item of the listed
  turns as already in the session, and `--missing` maps the rater's descriptions of missed items to
  item IDs.
- [count-turn-blocks.ts](real-turns/count-turn-blocks.ts) renders each block through the product's
  own renderers and counts it at 4 characters a token, the count the product budgets with.
- [pick-turn-query.ts](real-turns/pick-turn-query.ts) holds the short-message rules and the query
  window, and [rank-turn.ts](real-turns/rank-turn.ts) the keyword weight and the hub correction.
- [pick-kept-labels.ts](real-turns/pick-kept-labels.ts) drops the labels the scores leave out, and
  [pick-held-out-cases.ts](real-turns/pick-held-out-cases.ts) splits the rest into halves.
- [score-blocks.ts](real-turns/score-blocks.ts) scores what each block showed, and
  [score-message-floors.ts](real-turns/score-message-floors.ts) the similarity floors on the past
  messages shown, which this write-up does not report.

### Data

The snapshot held 25,533 records over 24 days, 151 memory items and 254 versions [measured]. It
rebuilds 1,401 conversation turns, and hybrid retrieval ran on 1,056 of them [measured]. From 16
Oct, each conversation turn record lists the past messages its turn was shown: 1,056 of the 1,439
records do, and the 383 before that date do not [measured]. The deployment sets `retrieval_messages`
to 1 and keeps every other memory setting at its default [from a record]. Replaying the shipped
settings matched the logged retrieval on 1,047 of the 1,056 hybrid turns, and on 144 of the 153 that
returned an item [measured]. The replay follows each item's sensitive flag from the record that set
it, so a turn before the flag sees the item as the live turn did [read in the code]. The one-off
scripts replayed 1,054 of the 1,056 hybrid turns, and why they skipped the other 2 went unrecorded
[one-off script].

### Labels

The deployment's assistant rated a sample of 286 turns: every short turn, every turn shown an item,
and the rest at random [measured]. For each turn it saw the exchange and the rated list, marked each
item needed or not, and described any item it missed [from a record]. One rater gave every label,
and no second rater checked them [measured].

The rated list holds the items from 4 sources: the top 5 of the shipped ranking of the whole store,
what the shipped settings showed, what each short-message and pasted-text setting showed, and the
items the turn logged [read in the code]. The other compared settings could show an item outside
that list: the similarity and BM25 floors, the BM25 weights, the hub corrections, the query windows
and the item counts. The scores count such an item as shown and not needed. For those settings,
fresh recall and precision can read low, and a turn can count as needing none when an unrated item
would have helped [read in the code]. The labels are no longer at hand, so the count of such items
is unknown. The sample builder in the harness pools every compared served setting, so a sample it
builds has no such gap [read in the code].

- 285 labels matched the sample, and 1 named a turn outside it [measured].
- 15 labels fall on turns about the memory work itself: a block of such turns, and turns the rater
  named as audits of its own memory. 10 match a general rule for turns about retrieval, 6 of them in
  both groups. 1 falls on a turn with a shredded reply, which the named list already covers.
  Dropping all of them leaves 266 scored turns [measured].
- An item the session was given before, or one its own exchange added or approved, counts as held:
  the scores treat it as delivered, not as a miss or as noise [read in the code].
- A hash of each turn's ID and a fixed seed puts the turn in the held-out half or the selection
  half, so adding or dropping a turn moves no other turn [read in the code]. The held-out half holds
  151 turns and the selection half 115 [measured].
- The candidate settings came from the real-turn floor sweep and the rater's notes, chosen with all
  labelled turns in view [from a record]. The held-out half guards against tuning a value to the
  turns, not against having seen the data.

The scores leave out the named audit turns. Kept in, they add 8 turns, 274 in all, and leave every
conclusion the same [measured]:

| Audit turns | Shipped: shown on empty | Similarity 0.46, BM25 2: shown on empty | Fresh change |
| ----------- | ----------------------- | --------------------------------------- | ------------ |
| Left out    | 1.44                    | 1.00                                    | 0 (0 to 0)   |
| Kept in     | 1.46                    | 1.01                                    | 0 (0 to 0)   |

Both rows cover the held-out half, and [the fixes](#fixes-on-the-held-out-half) define each column
[measured].

## Tokens per block

Each count covers the 1,056 hybrid turns [measured]. Pinned memory goes only into a session's
opening, so it counts on the 8 turns that opened a session [read in the code].

| Block           | Turns with it | Tokens when present | 90th percentile | Tokens per turn |
| --------------- | ------------- | ------------------- | --------------- | --------------- |
| Pinned memory   | 8             | 336                 | 507             | 2.5             |
| Retrieved items | 146           | 426                 | 794             | 59              |
| Self notes      | 60            | 308                 | 523             | 17              |
| Past messages   | 801           | 124                 | 208             | 94              |

The past-message counts came from each message's text cut at 1,000 characters, without the tags the
product puts around pasted or dropped text and without its image markers [read in the code]. They
read low by about 13 tokens for each such span and 11 for each image [read in the code]. The
snapshot is no longer at hand, so the counts stand as measured.

A turn's model calls read a mean of 155,714 input tokens a call, cached or not, so the blocks a turn
adds come to about 0.1% of one call [measured]. A block stays in the session once given, and a
session held a median of 19,142 memory tokens at a hybrid turn, with a maximum of 35,335 [measured].
That count resets only when a session opens, and 3 compactions do not reset it, so it is an upper
bound [measured]. The measured count also missed each session that opened on a step with no turn,
such as an image-only message, and so can read high again [read in the code]. The harness counts
those sessions, with the pinned block each one gave [read in the code].

## Noise per block

Each block's precision is the share of what the turn was shown, as logged, that the rater marked
needed, over the 266 scored turns [measured]. The rater marks an item misleading when the item
caused a wrong reply, and the scores count it apart from plain noise [read in the code].

| Block           | Turns shown it | Shown | Needed | Misleading | Precision |
| --------------- | -------------- | ----- | ------ | ---------- | --------- |
| Retrieved items | 133            | 420   | 24     | 0          | 0.057     |
| Self notes      | 56             | 92    | 5      | 0          | 0.054     |
| Past messages   | 221            | 265   | 8      | 0          | 0.030     |

The past-messages block carries the most noise: it showed on the most turns, at the lowest precision
[measured]. The rater called an item misleading on 2 turns, and per-turn retrieval showed neither
item on its turn under any compared setting: the session already held one from an earlier turn, and
the turn's retrieval did not return the other [measured].

## Fixes on the held-out half

The assistant proposed 5 fixes [from a record]. The table covers the held-out half: 18 turns that
needed an item the session did not hold, and 97 turns that needed none [measured]. Every setting but
the shipped one could show an item that nobody rated, as [labels](#labels) explains.

- Fresh recall is the mean, over the 18 turns, of the share of such needed items that the turn
  showed.
- Fresh change is the paired difference in fresh recall from shipped, with its 95% bootstrap
  interval.
- Shown on empty is the mean count of items shown on a turn that needed none.

| Setting                                   | Fresh recall | Fresh change             | Shown on empty | Precision | Shown per turn |
| ----------------------------------------- | ------------ | ------------------------ | -------------- | --------- | -------------- |
| Shipped: similarity 0.38, BM25 floor 0.25 | 0.722        | none                     | 1.44           | 0.058     | 1.87           |
| Similarity 0.46, BM25 floor 2             | 0.722        | 0 (0 to 0)               | 1.00           | 0.071     | 1.52           |
| Similarity 0.42, BM25 floor 2             | 0.722        | 0 (0 to 0)               | 1.04           | 0.069     | 1.56           |
| BM25 floor 4                              | 0.667        | -0.056 (-0.167 to 0)     | 0.93           | 0.073     | 1.37           |
| Hub penalty 0.5                           | 0.833        | 0.111 (0 to 0.278)       | 1.44           | 0.066     | 1.87           |
| Query window: the last user message added | 0.694        | -0.028 (-0.194 to 0.167) | 1.68           | 0.051     | 2.07           |
| Query window: the previous exchange added | 0.750        | 0.028 (-0.194 to 0.278)  | 2.20           | 0.045     | 2.47           |
| BM25 off                                  | 0.472        | -0.25 (-0.5 to 0)        | 0.81           | 0.061     | 1.17           |

Ranked by the held-out half, the fixes come out in this order:

1. **A higher bar for every item.** Similarity 0.46 with a BM25 floor of 2 showed 31% fewer items on
   turns that needed none, and fresh recall stayed the same on every one of the 18 turns [measured].
   The selection half gave the same result: 1.04 against 1.49 shown on empty, with no change in
   fresh recall [measured]. The assistant proposed a bar only for heavy personal items, and BM25
   alone showed both such items it named, with similarity below the shipped floor [one-off script].
   A BM25 floor is the general form of that fix [guess]. BM25 floor 4 cut more, but lowered fresh
   recall on both halves [measured].
2. **No item that the current exchange added or approved.** Of 554 items that the shipped settings
   showed over 1,054 hybrid turns, 59 came from the turn's own exchange, on 46 turns, and the rater
   marked 2 of the 59 needed [one-off script]. The exchange already holds what those 2 say, so
   leaving such items out loses nothing the turn lacks [guess]. Only those 2 of the 59 rest on the
   labels [one-off script].
3. **A similarity floor on past messages.** This measurement gives no result for it, as
   [past messages](#past-messages) explains.
4. **Rating fields for misleading and missed items.** The missed-item descriptions found 8 needed
   items that the store held and the session lacked, which the scores count [measured]. Only 2 turns
   carry a misleading item, too few to score a fix on [measured]. The product's rate tool already
   takes a misleading verdict, and has no field for a memory the turn missed [read in the code].
5. **A query window.** Adding earlier messages to the query showed 16% to 52% more items on turns
   that needed none, and moved fresh recall by 0.028 at most, within intervals that cross zero
   [measured]. On the selection half, fresh recall fell by 0.143 to 0.357 [measured].

## The keyword weight

BM25 put most wrong items in front of the assistant. Of 35 wrong appearances of the 8 items the
rater named, BM25 alone listed the item on 17, the vector list alone on 6, and both on 12 [one-off
script]. On the 12 turns that needed one of those items, neither list passed it on 5, BM25 alone on
2, the vectors alone on 1, and both on 4 [one-off script].

The weight does not fix it. On the held-out half, BM25 weights of 0.25, 0.5 and 2 moved fresh recall
by 0.028 at most and left the items shown on empty turns at 1.44 [measured]. On the selection half,
each lowered fresh recall by 0.071 to 0.143 [measured]. Weight 0 lowered fresh recall by 0.25 on the
held-out half and by 0.286 on the selection half [measured]. In the ranking, every weight from 0.25
to 2 scored within 0.046 of shipped recall@5 on the held-out half [measured]. The floor does fix it:
a floor on the BM25 score drops the weak matches that bring in unrelated items, and fix 1 uses it
[measured].

The product strips the user's and the agents' names from the query before both lists see it [read in
the code]. The stop list drops function words only, so common chat words such as "want", "thing" and
"like" stay in the BM25 query [read in the code]. 4 of the 35 wrong appearances shared only one such
word with the item [one-off script].

## Items shown on many turns

The log holds 559 showings of 130 items over the hybrid turns, and the 10 items shown most took 13%
of them [measured]. No item showed on more than 9 turns [measured]. A hub correction lowers an item
that sits close to many earlier messages:

- As a penalty of 0.5, it raised fresh recall by 0.111 on the held-out half and lowered it by 0.071
  on the selection half, and it left the items shown on empty turns unchanged [measured].
- In the ranking, a penalty of 0.5 or 1 lowered recall@5 by 0.037 to 0.049 on the held-out half
  [measured].
- As a floor that keeps an item only when its similarity reaches its hub score less 0.05, it cut 8%
  of the items shown on empty turns [measured].

The halves disagree, so the data does not support a correction per item [guess].

## Concrete and implied needs

Of the needed items that share a content word with the message, the shipped settings showed 22 of
24, and of those that share none, 5 of 12 [measured]. Retrieval finds what the message names and
misses what it implies [measured]. The harness counts this split for the shipped settings only, so
whether another setting closes the gap is open [guess].

## Turn kind

| Turns          | Turns that needed a fresh item | Turns that needed none | Fresh recall | Shown on empty | Precision |
| -------------- | ------------------------------ | ---------------------- | ------------ | -------------- | --------- |
| Technical      | 8                              | 18                     | 0.813        | 2.83           | 0.058     |
| Chat           | 24                             | 151                    | 0.771        | 1.30           | 0.059     |
| Writing memory | 6                              | 24                     | 0.833        | 2.33           | 0.054     |
| Not writing    | 26                             | 145                    | 0.769        | 1.32           | 0.060     |

The table covers all 266 scored turns, 41 of them technical and 225 chat [measured].

Technical turns showed more than twice the items of chat turns on turns that needed none [measured].
Fix 1 cut that count to 2.28 on technical turns and 0.87 on chat turns, with no change in fresh
recall in either [measured]. On a turn that writes memory, a shown item can stop a duplicate rather
than inform the reply, so those turns score apart [guess].

## Short messages

A message counts as short at 3 words or fewer, where a word is a sequence of letters or digits, so
an emoji alone counts as none [read in the code]. 93 of the 266 scored turns are short, and 3 of
them needed an item the session lacked [measured].

| Setting on a short message     | Needed items shown | Shown on empty | Precision |
| ------------------------------ | ------------------ | -------------- | --------- |
| Shipped                        | 1 of 3             | 0.12           | 0.13      |
| Skip retrieval                 | 0 of 3             | 0              | none      |
| Query with previous exchange   | 2 of 3             | 0.51           | 0.06      |
| Keyword and vector lists agree | 1 of 3             | 0              | 1         |

Short turns bring few items, because the session exclusion, which leaves out what the session was
already given, drops most of them [measured]. The past-messages block showed 78 messages on short
turns, and the rater marked none needed [measured]. On the held-out half, skipping retrieval on a
short message lowered fresh recall by 0.056, and asking the lists to agree changed nothing
[measured].

## Past messages

The past-messages block showed on 801 of the 1,056 hybrid turns, at a mean of 124 tokens [measured].
It ranks past messages by the same BM25 and vector fusion as the items, and asks for 1 message a
retrieval [read in the code]. It still showed 265 messages on 221 scored turns, so some turns ran
retrieval more than once [measured] [guess].

The write-up gives no similarity scores for the past messages shown. The product indexes only a
message's typed text, whole, which [find-typed-text.ts](real-turns/find-typed-text.ts) picks, and
the harness encodes that text [read in the code]. The labels needed to score it on this snapshot
were not at hand, so no similarity floor on past messages has a result here [from a record].

- By message length: on short turns the block showed 78 messages and the rater marked none needed.
  On the other turns it showed 187, and 8 were needed, a precision of 0.043 [measured].
- 6 of the 953 past messages shown repeat the current message word for word, from earlier in the
  thread [one-off script]. The exclusion leaves out only the current thread's held messages, so the
  exclusion works as written and these are earlier copies [read in the code].

## Bundled items

12 items hold more than one fact [one-off script]. Splitting each into one item per fact did not
help. On the held-out half the bundled parts were shown 61 times split against 28 whole, 24 of 26
needed parts were shown either way, and precision fell from 0.052 to 0.050 [one-off script]. On 3 of
the 14 turns that needed a bundled item, the rater's note does not say which fact helped [one-off
script].

## The sensitive flag

4 items carry the sensitive flag, and retrieval never shows a flagged item [measured] [read in the
code]. The rater described no missed item that was flagged [measured].

Each option applies the flag from the start, and runs at the shipped floors and at fix 1's floors,
similarity 0.46 and BM25 2. A show counts as BM25 alone when its similarity sits below that row's
similarity floor.

| Option | Rule                                         | Floors  | Shows over 1,054 hybrid turns | BM25 alone | Needed shows lost |
| ------ | -------------------------------------------- | ------- | ----------------------------- | ---------- | ----------------- |
| Keep   | never show a flagged item                    | either  | 0                             | 0          | 1                 |
| Narrow | show a flagged item at similarity 0.46 or up | shipped | 1                             | 0          | 1                 |
| Narrow | show a flagged item at similarity 0.46 or up | fix 1   | 1                             | 0          | 1                 |
| Remove | treat a flagged item as any other            | shipped | 33, on 30 turns               | 25         | 0                 |
| Remove | treat a flagged item as any other            | fix 1   | 31, on 27 turns               | 30         | 0                 |

Every count in the table comes from a one-off script.

- Fix 1 barely changes the remove option: 30 of its 31 shows pass the BM25 floor of 2 with a
  similarity below 0.46 [one-off script]. Fewer other items compete at fix 1's floors, which may
  lift a flagged item that a shipped turn ranked lower [guess].
- The 1 needed show came before the item's flag, at a similarity below the shipped floor, so a
  similarity bar hides it too, and narrowing gains nothing on this data [one-off script].
- Before their flags, the flagged items showed on 3 rated turns, and the rater marked 1 of those
  shows needed [measured]. Most of what those shows brought was noise, and fix 1 does not remove it
  [one-off script].
- A planned per-task memory setting ([GEO-2357](https://linear.app/zgeoff/issue/GEO-2357)) gives a
  task started with memory none no pinned or retrieved memory, so a task on another model sees no
  flagged item [from a record]. It does not cover the conversation itself [read in the code].

Keep the flag. Removing it adds 31 to 33 shows, most from BM25 alone, to gain 1 needed show, with or
without fix 1 [one-off script].

## Harness checks

- The rebuilt item versions matched the logged versions on every turn, so no score reads a version
  the turn did not have [one-off script].
- The missed-item descriptions on the scored turns matched 52 items: 38 the session already held, 7
  the store held and retrieval missed, 1 the sample pooled, and 6 with no active version at the turn
  [measured]. 10 descriptions matched no item [measured]. The rated list is not the whole store, so
  7 needed items sat outside it [read in the code].
- Of 1,448 replies, 2 are shredded rather than blank, and the harness reads them as shredded
  [measured].

## How much rests on one rater

Every fresh-recall and precision number above rests on the one rater's labels [measured]. Two counts
do not: items shown per turn, which fix 1 cuts from 1.87 to 1.52 on the held-out half, and the 59
exchange items of fix 2 [measured] [one-off script]. On an earlier snapshot, stand-in labels from a
language model given the assistant's persona found a fresh-recall loss of 0.05 to 0.08 for
similarity 0.42 or a BM25 floor of 2, with intervals that reach zero, as
[the real-turn floors](real-turns.md#floors-and-item-count) show [from a record]. The stand-in
labels support the cut in shown items, and leave open a small loss of needed items [guess]. The
held-out half holds 18 turns with a needed item, so a change of 0 there bounds the loss near 17%, by
the rule of three [measured].

## Options

| Option                                     | Effort           | Risk                                                        |
| ------------------------------------------ | ---------------- | ----------------------------------------------------------- |
| Similarity floor 0.46 and BM25 floor 2     | 2 config values  | a needed item that shares few words is lost; bound near 17% |
| Leave out items the current exchange added | 1 rule in recall | 2 of 59 such shows were needed, and the exchange held both  |
| Keep the sensitive flag                    | none             | 1 needed show lost on this data                             |
| Query window, hub correction, bundle split | not advised      | each added noise, or the halves disagreed                   |

## Untested

- A second rater, and more than 18 held-out turns with a needed item the session lacked.
- Each compared setting other than shipped, scored on a sample that pools every item it shows.
- A similarity floor on past messages, scored on the text the product indexes.
- Dropping pasted text from the query, by the product's typed-text rule.
- A staleness check on past messages, which would drop a message that a later one replaced.
- The higher bar on the stand-in labels, whose snapshot this measurement did not have.
- A reranker or a model's judgement of the top results, which the
  [real-turn answer](real-turns.md#answer) names as the way past a precision near 0.1.
