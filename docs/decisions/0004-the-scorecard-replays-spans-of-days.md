---
status: accepted
date: 2026-10-21
---

# The scorecard replays spans of days around the truth's cases, from day slices of the catalogue's history

Breakups replays twenty years of every object's sets. This detector's
truth in low orbit since 2020 holds a handful of cases, four of them
invisible to public data, so the scorecard replays spans of days around
each case (`data/spans.json`), every low-orbit object in them, each set
read when the catalogue published it (its creation time), and lands what
the detector raised on the truth: a case is detected when a hold was
raised on its pair inside its window widened by three days, the lead is
read against the earliest day a source stated the hold, a hold on no case
is false unless it carries an exclusion tag (exempt) or was raised less
than ninety days before the truth's date (pending, as breakups reads an
unreported confirmation). The aggregate, `kpi/latest.json` and
`kpi/latest.md`, is committed and the README's table is written from it.

The sets come from breakups' Archive: its day slices of the catalogue's
history class where it has them (2026), and its yearly columns, built from
the yearly bundles, for the earlier spans, where a set is read on the day
of its epoch since the bundles keep no publication time. The spans are
exported as day slices of their own (`npm run archive:export`) and kept
on the machine that replays them. Unlike breakups, nothing of the Archive
is uploaded: the aggregate is committed with the hashes of the detector,
the truth and the exclusions it was made with, the tests check those
against what the package ships, and CI never replays. A reader who wants
the aggregate again pulls the spans from Space-Track.

## Considered options

- Replay whole years: a hundred million sets for two detectable holds.
- Read the sets by their epoch day: a day of hindsight on every verdict;
  the replay of step 2 read them so and was a day late.
- Spans around the cases, sets read at publication, the Archive kept
  local and the aggregate committed with its hashes (chosen).
- The spans as assets of a release of this repository, so that CI could
  replay them: derived Space-Track data uploaded for a number that only
  changes when the detector does.

## Consequences

- `scripts/replay/run.ts` is both the replay and the scorecard's engine;
  `scripts/kpi/` lands and aggregates; `kpi/work/` keeps each span's
  verdicts so `--rematch` lands them again without a replay.
- The earlier spans' leads are measured from the epoch day, not the
  publication time, and the aggregate says so per span.
- A new case in the truth is a new span in `data/spans.json`, pulled or
  exported into the Archive before the scorecard is replayed locally.
