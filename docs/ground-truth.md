# The ground truth

The list of public rendezvous the detector is scored against. It is built by `npm run truth` from statements typed by hand under `data/truth/hand/` and from snapshots of GCAT's catalogue under `data/truth/sources/`, into `data/rendezvous.json`, one row per case, with every source's statement verbatim beside the values resolved from them. The generated report, [docs/truth.md](truth.md), lists every case, the conflicts between sources and the counts. Neither built file is edited by hand: a reviewer edits the hand file and rebuilds.

## What counts as a rendezvous

A case is one chaser and one target: a satellite that moved onto another's orbit and held beside it, or passed it closely, as a public source states it, in low Earth orbit or the geostationary belt, since 2014. Every rendezvous counts, whatever its purpose: an inspection, a servicing docking, a demonstration with the operator's own stage, a pass by a surveillance satellite. Whether the two objects share an owner, a launch or a state is recorded on the row (`relation`, from GCAT's owner codes and launch tags) and decides nothing in the truth; the scorecard's scope rules read it.

Each row carries the stages the detector raises, as the sources state them, each a UTC day window at the precision the source gives:

- **plane**: the chaser within a fraction of a degree of the target's orbital plane, by launch into it or by manoeuvre, with the separation of the planes where a source gives it;
- **height**: the semi-major axes matched;
- **beside**: the chaser holding near the target (in the belt, its arrival at the slot);
- **closest**: the nearest pass stated, in kilometres, on the day it is stated;
- **left**: the chaser moving away.

A blank stage is one no source states. A geostationary station states no plane or height, since the belt shares them. A pass with no hold (a flyby by a GSSAP satellite, a crossing by one of the Cosmos 2609 to 2614 batch) is a row with a closest pass and no beside, so the scorecard can tell a hold from a pass.

## The sources

Every statement names where it was read, with the link where there is one, and the day it was published. Its kind is one of:

- **tracker**: a tracking company's measurement (LeoLabs, COMSPOC, Slingshot Aerospace, Kratos, Integrity ISR, ExoAnalytic, s2a systems);
- **operator**: the operator's own announcement (Astroscale, Northrop Grumman and Intelsat, Optus);
- **government**: a government's statement (the U.S. Space Force and Space Command, the Pentagon, France's defence minister);
- **analyst**: a named analyst reading public elements (Marco Langbroek, Jonathan McDowell, Bart Hendrickx, Nico Janssen, Ted Molczan, Michael Thompson, Pavel Podvig, Anatoly Zak, Orbinauts);
- **institute**: a think tank's compilation (CSIS's data repository and Space Threat Assessments, the Secure World Foundation's reports and fact sheets);
- **news**: a news report (SpaceNews, Space.com, Breaking Defense, Axios, MIT Technology Review, Cosmic Log).

The objects' names, launches and owners are GCAT's (Jonathan McDowell, planet4589.org, CC-BY-4.0), from a snapshot reduced to the objects named and the columns read; `data/truth/sources.json` records the whole files' hashes.

## How the rows are built

Statements of one chaser and one target are one case where they open within 120 days of each other; a statement of only a pass or a departure joins the pair's open case however late it comes (a departure reported years after the arrival). Each stage is resolved from the statement that states it most finely, the earliest on a tie, since a hold begins when the first source has it begin; the nearest pass is the least distance stated at the finest precision, a measurement before a reading of public elements. Two sources of one precision more than three days apart on a window, or more than twofold apart on one day's pass, are a conflict, listed on the row and in the report.

The confidence is **A** where a tracking company, an operator or a government states the day of the hold or of a measured pass; **B** where any source states a day; **C** where the finest stage is stated to the month; **D** to the year.

## Known gaps

- The Russian inspectors' passes in low orbit (Kosmos 2558, 2576, 2588) are stated as a distance every few days, not as a dated hold; the rows carry the plane match at launch and the nearest pass.
- Kosmos 2576's departure from USA 314's plane is disputed: CSIS and Hendrickx date it to February 2025, Langbroek and Breaking Defense had it still co-planar in mid-2025.
- Luch's visits to Intelsat 36 (1.8 km) and Azerspace-2 are dated only to the year; Luch 2's 2026 position is Intelsat 39's by every report found, with no departure reported.
- GSSAP's approaches of 2016 to 2018 name no vehicle; the row lists the four candidates.
- Not typed: cases a source lists as a nearest neighbour at hundreds of kilometres (TJS-15 near SBIRS GEO-5 and WGS-4; TJS-10's aborted approach to Kosmos 2589), the Kosmos 2589 and 2590 pair in highly elliptical orbit, and the same-owner Chinese pair Shiyan 24C with Shijian 6 05 in low orbit, whose dates no source gives to the month.
