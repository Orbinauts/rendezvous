# The replay of the low-orbit cases

Step 2 of the project: the prototype detector run over every low-orbit object's public element sets around each case of the ground truth in low Earth orbit, to see on which day each stage would have fired and what else fired that was not a rendezvous. The runs are `npm run replay -- --from <day> --to <day> --gcat <dir>`; each writes `<from>-to-<to>.md` (the tables) and `.json` (every verdict) beside this page. The thresholds are the brief's, not fitted: plane within 0.1 degrees, height within 5 km, beside within 100 km at noon on two days running, left beyond 200 km on two days running.

## Where the sets come from

- 2026: the catalogue's history class, a day of epochs at a time, every object, each set read on the day Space-Track published it. The days to 8 October are breakups' local Archive; 9 to 21 October were pulled by `scripts/archive/pull-days.ts` into `../rendezvous-archive`.
- 2019 to 2025: breakups' yearly columns, built from the yearly bundles, which keep the order of publication but not its time, so a set is read on the day of its epoch.

GCAT's catalogue of 17 October 2026 gives names, kinds, launches and owners. A chaser must be a payload; a target may be anything.

## How the prototype reads the stages

An object that moved (its inclination changed by more than 0.01 degrees, its node by more than 0.05 degrees beyond J2, or its semi-major axis by more than 0.5 km beyond drag, between consecutive sets) or that is new (first set within 60 days of launch) is searched for every fresh object whose plane it shares within 0.1 degrees. Each such pair is watched from then on and read at noon each day: height when the semi-major axes are within 5 km, beside when SGP4 puts them within 100 km on two noons running, left when they are beyond 200 km (or 5 km apart in height) on two noons running. A pair of one launch or one owner is counted at the plane stage and not watched, since constellations would make millions of pairs; a crewed station's visitors and a stack still dispersing (both objects under 90 days from launch, by GCAT's launch day or the object's first appearance) are watched and tagged. The code is `scripts/replay/`.

## What fired on the truth's cases

| Case | Truth | Replay |
| --- | --- | --- |
| Cosmos 2612 and ICEYE-X36, October 2026 | plane 30 Sep to 14 Oct (0.002° by 13 Oct); height 12 Oct; beside 16 Oct; closest 0.5 km on 18 Oct; left 18 to 19 Oct | plane 7 Oct; height 13 Oct; beside 17 Oct; left 20 Oct; 1.7 km at noon on 18 Oct |
| Cosmos 2612 and ICEYE-X36, May 2026 | plane 14 to 20 May; height 14 to 20 May | plane 16 May; height 16 May |
| Cosmos 2610 and ICEYE-X36, May 2026 | plane 14 to 16 May (0.03°); height; 10.8 km pass on 30 Sep | plane 16 May; height 16 May; no hold |
| Cosmos 2611, 2613, 2614 and ICEYE-X36 | planes 0.6°, 0.12° and 0.6° off; passes of 12.8, 3.9 and 16 km | nothing: their planes stayed outside 0.1° |
| Cosmos 2609 and ICEYE-X36 | a 2.5 km crossing pass on 26 May, planes 0.4° apart | nothing: a pass is no stage |
| ADRAS-J and the H-2A stage, 2024 | beside from 17 Apr; 15 m on 30 Nov | plane and height 19 Jun, beside 8 Jul (the run began 6 May, after the approach; its fly-around of 19 Jun was the first move in the span) |
| Kosmos 2542 and 2543 and USA 245, 2020; Kosmos 2558 and USA 326, 2022; Kosmos 2576 and USA 314, 2024; Kosmos 2588 and USA 338, 2025; Kosmos 2558's subsatellite and USA 326 | plane at launch or by manoeuvre; passes of 30 to 94 km | nothing, and nothing can: USA 245, 314, 326 and 338 have no public element sets in any year. Space-Track does not publish them. |
| Kosmos 2581, 2582 and 2583 (2025); Kosmos 2536 and 2535; Kosmos 2521 and 2519; ELSA-d; Otter Pup 2 | same launch | counted at the plane stage, not watched, by design |

The hold on ICEYE-X36 fires a day after the truth's, because it asks for two noons within 100 km; the departure two days after, for the same reason. The second plane verdict of 7 October is the inclination change of that day, which brought the planes within 0.1 degrees before the descent of 12 October closed them to 0.002.

Two readings of the brief that the cases force:

- **A plane within 0.1 degrees is not what the Russian inspectors do.** Kosmos 2558, 2576 and 2588 matched their target's node to within 0.02 to 0.11 degrees and left the inclination 0.15 to 0.8 degrees off, so the planes meet at the nodes and the pair passes every few days at 50 to 94 km. Their planes never come within 0.1 degrees. Were their targets public, the plane stage as written would not fire; a node match with the inclination within a degree would. Cosmos 2612 did match the plane itself, to 0.002 degrees.
- **The four US targets are invisible.** Every Russian case against a US reconnaissance satellite is scored against amateur-derived orbits (Langbroek's, Seesat-L's), which the detector will never have. Of the truth's low-orbit cases since 2020 that a public-data detector can see, Cosmos 2612 is the one that held beside its target.

## What else fired

| Span | Plane verdicts | Height | Beside holds | Holds tagged station visitor | Holds tagged dispersing stack | Holds untagged | Of them the truth's |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2019-12-01 to 2020-04-30 | 307 | 193 | 47 | 30 | 14 | 3 | 0 |
| 2022-07-20 to 2022-10-31 | 856 | 403 | 30 | 23 | 1 | 6 | 0 |
| 2024-05-06 to 2024-08-31 | 2,666 | 756 | 40 | 35 | 1 | 4 | 1 |
| 2025-02-01 to 2025-08-31 | 6,151 | 1,720 | 87 | 57 | 2 | 28 | 0 |
| 2026-04-06 to 2026-10-21 | 23,275 | 7,943 | 181 | 84 | 81 | 16 | 1 |

Pairs of one launch or one owner, counted at the plane stage and never watched: 275,549 and 3,005 in the 2020 span, 1,257,189 and 504,946 in the 2026 span, nearly all Starlink.

The plane stage alone is a watch list, not an alert: thousands of verdicts a span, most of them two objects of different owners whose planes happen to cross within 0.1 degrees as one of them manoeuvres (USA 485 and 486 among the Starlink shells, 466 and 371 verdicts in 2026; OneWeb spares climbing to their slots; LEO Express 2 among the Flock satellites). The beside stage is where the noise is small enough to read, and what is left of it is of four kinds, each a matter of data rather than of the detector:

1. **One company under several owner codes.** OneWeb's spares (`ONEWEBE`, the Eutelsat-era batch) climbing to the slots of its first satellites (`ONEWEB`, `ONEWEBN`): 20 of the 28 untagged holds of 2025, 1 of 2022, 1 of 2026. GCAT's parent chain does not join them. The exclusions file of step 3 should carry owner groups.
2. **One object under two catalogue numbers.** A hold at 0.0 km with identical elements is a temporary or analyst number beside the permanent one (a Cygnus and its ISS-released cubesats under new numbers, 100057 and 100712 against S.S. Steven R. Nagel; Starlink 5967 against 82778; 85412 against a piece of Ablestar debris; Siwei Gaojing 3-01 against Rock at 0.1 km). A pair whose distance is under a kilometre with the same semi-major axis is one object, to be read as such.
3. **Visitors named by their ship.** GCAT names Cygnus craft by their ship names (S.S. Steven R. Nagel, S.S. Patricia Robertson), which the visitor list did not match; Calypso, a cubesat released from the station, matched one of them. The visitor list should read GCAT's names or the station's launch, as breakups generates its list from the catalogue.
4. **Rideshare clusters past 90 days, and debris as targets.** A few holds between unnamed objects of one rideshare launch whose numbers GCAT had not yet matched (63986 and 66746; 270296 and 270192), Tianfu Dongpo satellites beside a piece of StriX debris of their own launch, Lemur-2 beside Centaur debris at 2.7 km, FalconEye 2 beside WorldView-3 at 73 km for three weeks of May 2026 (both at 620 km in the same sun-synchronous plane; the one untagged hold of a different-owner pair that a reader might want to see).

Everything else that held beside another object in these spans was a crewed station and its visitors, or a stack within 90 days of launch.

## What this says for step 3

- The detector's unit is the pair, and the stage machine above is enough for the beside verdict; breakups' step estimator is not needed for the geometry, only for attributing a move to one object, which the per-set change test did here.
- The published verdict is beside, with plane and height on its row as the timeline, and left closing it, as agreed.
- The exclusions become one data file: station launches and visitor names generated from GCAT, owner groups, the dispersing window, the duplicate-number rule, and a fragment on either side (eight of the untagged holds were a satellite drifting past a fragment of DMSP F-13, of a Centaur, of FY-1C, or two fragments of the CZ-6A Y21 breakup under temporary numbers; nobody but a removal mission meets a fragment, and those meet a rocket body or a dead payload).
- The scorecard's recall on the truth's low-orbit cases is bounded by the public data: four of the six Russian cases against US satellites cannot be seen, and the truth should mark a target with no public sets as such, as breakups lists parents with no elements apart.
- The node-only plane match is worth measuring beside the 0.1 degree one, since it is the form the shadowing cases take.

## Since this replay

The detector that replaced the prototype (`src/detector.ts`, `beside-v1`) reads the sets one by one as the catalogue publishes them and calls a hold from the first set that shows it, with the day ahead propagated rather than waited for ([docs/decisions/0003](../decisions/0003-the-published-verdict-is-the-hold-read-set-by-set.md)); the tables above are the daily prototype's. The scorecard's replays of the same spans with the current detector are in [kpi/latest.md](../../kpi/latest.md).
