---
status: accepted
date: 2026-10-21
---

# A standalone package built on breakups' recipe, with its code copied in

`@orbinauts/rendezvous` detects one satellite moving onto another's orbit
and holding beside it, from public element histories. It is the sibling
of `@orbinauts/breakups` and follows its recipe, decision by decision: a
standalone repository that owns its ground truth, generated with
provenance (breakups' 0001 and 0002); a scorecard that replays the
detector and whose number CI must make again (0004); a frozen detector
tested prospectively (0008); a daily run that keeps the project up to
date (0009); verdicts published as static JSON on GitHub Pages for the
site to read (0010); not published to npm (0012). Each is recorded here
again only where this project reads it differently.

The one departure the owner decided on 2026-10-21: there will be no
breakups package to depend on. What this project needs of breakups' code
(its element reading, its Space-Track client, its Archive's slice format,
its states as text) is copied in, with the source named at the top of
each file, rather than imported. The two detectors read the same sets but
raise different things, and a shared package would tie each release of one
to the other for a few hundred lines.

## Considered options

- Import breakups from GitHub as a dependency, pinned by tag: one copy of
  the code, but every change to breakups' internals a change here, and a
  library installed for four files.
- A third package shared by both: a release to keep for two readers.
- Copy what is needed, naming the source (chosen).

## Consequences

- `src/elements.ts`, `src/states.ts`, `scripts/archive/space-track.ts`
  and the slice format carry a note naming the breakups file they came
  from; a fix found in one is applied to the other by hand.
- Breakups' step estimator is not copied: the rendezvous detector's unit
  is the pair, and a move is read from an object's consecutive sets
  (the second decision record).
