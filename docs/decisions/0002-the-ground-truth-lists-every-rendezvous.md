---
status: accepted
date: 2026-10-21
---

# The ground truth lists every public rendezvous, and the exclusions are data the scorecard reads

The truth, `data/rendezvous.json`, is built by `npm run truth` from
statements typed by hand under `data/truth/hand/` (one per source per pair
of objects, with the reference, the link, the day it was published, a
quote and the stages it states) and from snapshots of GCAT's catalogue
and organisations table reduced to the objects named, as breakups builds
its truth from snapshots and a hand file. Each case resolves each stage
from the finest statement, lists every disagreement and names the owners
from the catalogue (`docs/ground-truth.md`).

The owner decided on 2026-10-21 that the truth lists every rendezvous,
cooperative, same owner or not: a servicing docking, a demonstration with
the operator's own stage, a Chinese satellite's approach to a Chinese one,
a surveillance satellite's pass. Whether a pair shares an owner, a launch
or a state is recorded on the row as data (`relation`) and decides nothing
in the truth. The brief's exclusions (one owner, one launch, a station's
visitors, a dispersing stack) and one of the replay's (a fragment on either
side, which nobody but a removal mission meets, and those meet a rocket
body or a dead payload) are one data file, `data/exclusions.json`,
that the detector reads to tag its verdicts, and the scorecard and the
published files read the tag.

"One owner" is read as one GCAT owner code, one owner group named in the
file (OneWeb's three codes, Intelsat's three), or two defence-class
owners of one state, since GCAT gives Kosmos 2542 and 2543 two codes and
the Cosmos 2609 batch a third, with no parent that joins them.

## Considered options

- A truth of adversarial rendezvous only: the detector reports geometry,
  and what a pair's relation means is a later analysis.
- The exclusions in code: not reviewable, and OneWeb's codes showed on the
  first replay that the list changes with the data.
- Every rendezvous in the truth, the relation as data, the exclusions as
  data (chosen).

## Consequences

- A case of one launch or one owner is in the truth but the detector never
  watches the pair; the scorecard lists such cases apart as excluded by
  data, and a change to the exclusions file moves them in or out with no
  change to the detector.
- A case whose chaser or target has no public element sets (the United
  States reconnaissance satellites) is listed apart as invisible: the
  truth scores it against amateur orbits the detector never has.
