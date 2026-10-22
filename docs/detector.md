# The detector

`src/detector.ts`, `beside-v1`. A state machine over pairs of objects, run on every set as the catalogue publishes it. Nothing here is fitted: every threshold is the brief's or the step 2 replay's, named in `DETECTOR_PARAMETERS` with that provenance, and the scorecard measures them.

## A move

An object's new set is read against its last: a change of inclination over 0.01 degrees, of the node over 0.05 degrees beyond its J2 precession, or of the semi-major axis over 0.5 km beyond its own drag rate, is a move. An object first seen within 60 days of its GCAT launch day, or with no GCAT row once the detector has run ten days, is new, and a plane match on it is `at launch`. Only a payload, by GCAT's kind, is searched as a chaser; any object may be a target.

## The plane search

The moved object is read against every fresh object (a set within 15 days) in the inclination buckets within a degree of its own: the angle between the planes, each node carried to the instant at its own J2 rate, within 0.1 degrees is a plane match, and the pair is watched. The nodes within 0.1 degrees with the inclinations within a degree, but the planes further apart, is a node match, raised as a plane verdict marked `node` and not watched: the form the shadowing of a reconnaissance satellite takes (Kosmos 2558, 2576, 2588), measured so it can be scored, not followed.

A pair of one launch or one owner is counted and not watched. The rest are watched and tagged.

## The stages on a watched pair

Every new set of either object reads the pair at the newer epoch: the plane angle, the heights' difference, the eccentricities' difference, and, where the planes are within 0.1 degrees and the heights within 50 km, the distance by SGP4 now and 24 hours later.

- **height**: raised once the heights are within 5 km in plane; off again after two sets beyond 10 km or out of plane with no hold on.
- **beside**: with the height on and the heights within 5 km at that set, raised at the first set with the distance within 100 km now and 24 hours later; confirmed by the next set within 100 km an hour or more later; withdrawn where the next set has the pair beyond 200 km now and later.
- **left**: with a hold confirmed, raised at the first set with the pair beyond 200 km, or more than 5 km apart in height, now and later; confirmed by the next set that agrees, withdrawn where the next has them within 100 km again.
- A watched pair is dropped after 120 days with no height stage, or ten days out of plane with no hold; a pair no set has touched for 45 days is dropped; an object with no set for a year is forgotten.

Each verdict carries the geometry it was read from (`Evidence`), the set's epoch and publication time, and the pair's exclusion tag. The duplicate tag (one object under two catalogue numbers) is read at a pair's first distance reading only: a pair together from the first reading, within a kilometre and 50 m of height, is one object; a pair seen apart first is a rendezvous however close it comes, as ADRAS-J's 15 m or Cosmos 2612's few hundred metres.

## What the replay found

`docs/replay/README.md` records the prototype's run over five spans since 2020 and why the rules are as they are: the plane stage alone is a watch list; the hold is quiet once the exclusions read the designator and a temporary number as a young object; the Russian inspectors match the node, not the plane; four of their targets are not public.
