---
status: accepted
date: 2026-10-22
---

# The live run is hourly, from a frozen tag

The scorecard is a backtest: five spans replayed through a detector
whose rules were chosen looking at them. It cannot show what the detector
does on sets nobody had seen when the rules were chosen, and the three
holds it rests on are a track record, not a statistic. And being first to
publish a hold matters to the project: the Cosmos 2612 hold was callable
from the set of 16 October 2026 at 18:00 UTC, six hours before the first
public statement, and a daily run would have given most of that away.

## The decision

- **The detector is a tag, loaded from its own worktree.** `frozen-beside-v1`
  names the commit the detector `beside-v1` was scored at. The run checks
  out the tag beside main, installs its one runtime dependency at the
  version it was scored with (`satellite.js` 7.1.0, pinned in
  `scripts/live/frozen.ts` and checked), and imports the detector from
  there, never from main. A tag that no longer names the frozen commit is
  refused. Work on main never changes what is being tested.
- **The data are main's.** The exclusions file, the ground truth and the
  GCAT snapshot are read from main at each run, so a change to the data
  changes what the next run tags and lands, never what the frozen
  detector computes. A change to the detector's rules is a new tag.
- **Every hour, by publication time.** The run pulls the sets published
  since the last run, by `CREATION_DATE`, and reads them in that order
  through the stored states, as the scorecard replays them
  ([0003](0003-the-published-verdict-is-the-hold-read-set-by-set.md)).
  The cursor is the last run's line on the `live` branch. One request an
  hour, a day at most per request after a gap.
- **The log is a branch, the states a release.** Every verdict is
  appended to `verdicts.jsonl` on the orphan branch `live`, committed and
  pushed by the run: the commit time is the proof of when it was known,
  the run's log on GitHub a second timestamp. The states between runs are
  an asset of the release `live-data`, replaced each hour, since a branch
  cannot carry a file that large that often. The branch is committed
  before the states are uploaded, and a verdict is logged once however
  many runs raise it, so a failed upload costs nothing but a repeated
  hour.
- **The published files follow from the log.** The whole log, selected
  against main's truth, is written to the `published` branch after each
  run, and Pages serves it. An issue is opened for each hold once
  confirmed, as the owner's notice.

## Considered options

- A daily run, as breakups: a day of lead given away on every hold.
- The detector from main: a change to the rules would change the test.
- The states on the branch: a few megabytes an hour in git history.
- Pulling by epoch day, as the Archive is kept: a day of hindsight on
  every verdict, the replay of step 2 showed.

## Consequences

- `scripts/live/` holds the run, the seed, the publisher, the issues and
  the release data; `.github/workflows/live.yml` runs them.
- The seed's verdicts carry the seed's logging time; the proof of time
  starts with the first hourly run.
- A new detector is a new tag and a new seed or carried states, and the
  scorecard that justifies it lands on main first.
