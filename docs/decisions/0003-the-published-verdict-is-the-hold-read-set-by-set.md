---
status: accepted
date: 2026-10-21
---

# The published verdict is the hold, raised from the first set and confirmed by the next

The brief listed four stages, each a verdict: plane, height, beside
(phase), departure. The replay of step 2 (`docs/replay/README.md`) showed
that a plane match on its own fires thousands of times a season (every
satellite manoeuvring within 0.1 degrees of another's plane, every
constellation spare climbing to its slot), and the owner agreed on
2026-10-21 that the thing published is a rendezvous: the hold. Plane and
height are its timeline, tracked and reported on the row, never an alert.
The departure closes it.

The same replay read the stages once a day at noon and asked for two
noons within 100 km before calling a hold, which put the verdict a day
after the fact. The owner asked that the delay be cut, since being first
to publish matters. Read set by set, the "held more than a day" test is a
prediction from the elements, both sets propagated a day ahead by SGP4
with no further manoeuvre, and on Cosmos 2612's own sets the hold is
callable at 18:00 UTC on 16 October 2026, from the set published then,
against the replay's noon of the 17th. One set can be a bad fit, with two
objects this close most of all, so the first set raises the verdict and
the next set that agrees, an hour or more later, confirms it; a next set
that has them far apart withdraws it. The published list shows a hold
from its raising and marks it confirmed.

## Considered options

- Four published alerts: the plane stage alone would be the watch list
  breakups' early warning is, at the same cost in false alarms.
- A hold called after two days' sets: a day late by construction.
- The hold raised at the first set, with the day-ahead propagation as the
  holding test, and confirmed by the next (chosen).

## Consequences

- The detector's unit is the pair and its state (`src/detector.ts`), run
  on every set as it is published; the live run of step 4 must run hourly
  for the latency to be the catalogue's own, one to nine hours from epoch
  to publication on the sets measured.
- The published state is `beside`, `confirmed` or `left`; a withdrawn hold
  with no later hold on the pair is not shown, and leaves the list if it
  was (`docs/published.md`).
- The thresholds (0.1 degrees, 5 km, 100 km, 24 hours, 200 km) are the
  brief's, named as parameters with that provenance and not fitted: the
  public record holds too few holds to fit on half of them.
