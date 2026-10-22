# @orbinauts/rendezvous

Detects one satellite moving onto another's orbit and holding beside it, from public orbital data alone, in TypeScript.

## What it does

When a satellite is sent to another satellite, its orbit changes in stages that the public catalogue of orbits shows: it enters the other's orbital plane, matches its height, then draws up beside it and holds there, and at some point moves away. This library reads the orbits the catalogue publishes, set by set as they come, and raises each stage as a verdict on the pair, naming the two objects and their owners, with the geometry it read; it says nothing of why. It is the detector behind [Orbinauts](https://orbinauts.com), a live satellite map, and the sibling of [@orbinauts/breakups](https://github.com/Orbinauts/breakups), whose recipe it follows: a ground truth generated with provenance, a scorecard that replays the detector, and verdicts published daily as static JSON.

It also ships the list of every public rendezvous since 2014 it is scored against: <!-- truth:count:begin -->117 cases<!-- truth:count:end -->, in low Earth orbit and the geostationary belt, each with the statements of every source that reported it.

## How well it works

The verdict that is published is the hold (`beside`): the chaser within 100 km of the target and still within it a day later with no further manoeuvre, read by SGP4 from the first set that shows it and confirmed by the next. The plane and height stages are its timeline, not alerts of their own. The scorecard replays the detector over every span of low-orbit days around the truth's cases since 2020 (`data/spans.json`), each set read when the catalogue published it:

<!-- kpi:summary:begin -->

| Holds in the truth a public-data detector can see | Result |
| --- | --- |
| Holds detected | 3 of 3 |
| Holds raised that were false | 19 of 24 (3 pending a report, 914 exempt by an exclusion tag) |
| Holds confirmed by a later set, withdrawn as a bad fit | 536, 401 |
| Median lead of a hold over the first public statement of it | 6 hours |
| Cases the public data cannot show (a chaser or target with no public sets) | 6 of 19 |
| Cases of one launch or one owner, left out by data | 4 of 19 |
| Plane stage raised on cases that state one; height stage | 4 of 7; 3 of 4 |

<!-- kpi:summary:end -->

Two things bound what the number can be. Four of the six Russian cases against United States satellites in the truth have targets with no public element sets at all, since Space-Track does not publish them: the truth scores them against amateur orbits the detector never has, and the scorecard lists them apart. And the thresholds are the brief's, not fitted: there are too few holds in the public record to fit on half and test on the other, as breakups does, so the honest measure is the [live run](#live-run) on new data. The [scorecard](kpi/latest.md) gives every case, every hold raised and what became of it.

## How it works

It reads only public data: the orbits the catalogue publishes for every object, and GCAT's satellite catalogue for names, kinds and owners. Every set that arrives is read at once.

1. **A move.** An object's new set shows its plane or its height changed since the last one, or the object is new to the catalogue.
2. **Plane.** The moved object is searched for every object whose orbital plane it now shares, within 0.1 degrees, and the pair is watched from then on. A node match with the inclination off by up to a degree, the form the Russian inspectors' shadowing takes, is measured beside it.
3. **Height.** The semi-major axes within 5 km.
4. **Beside.** The chaser within 100 km of the target now and a day later with no further manoeuvre, by SGP4. Raised at the first set that shows it, confirmed by the next set that agrees, withdrawn where the next set has them far apart again.
5. **Left.** After a hold, the pair beyond 200 km, or more than 5 km apart in height, now and a day later. Raised and confirmed the same way.

The pairs the brief leaves out are data, not code (`data/exclusions.json`): two objects of one launch or one owner (one GCAT owner code, one owner group such as OneWeb's three codes, or two defence owners of one state) are counted at the plane stage and never watched; a crewed station's visitors, a stack still dispersing after launch, a fragment on either side (nobody but a removal mission meets one, and those meet a rocket body or a dead payload, so a hold beside a fragment is a drift through a debris cloud), and one object under two catalogue numbers are watched and every verdict on them carries the tag, which the published files and the scorecard read. [docs/detector.md](docs/detector.md) gives every rule and where its threshold came from.

## Install

The package is not published to npm, as breakups is not ([docs/decisions/0005](docs/decisions/0005-the-package-is-not-published-to-npm.md)): to show the rendezvous it finds, read the [published JSON](docs/published.md), which needs no install. To run the library, install it from the repository, which builds it as it installs:

```sh
npm install github:Orbinauts/rendezvous
```

It needs Node 22 or later. The package is ESM only, ships TypeScript types, and imports no Node built-in; its one dependency is `satellite.js`, for SGP4.

A caller hands each run the sets published since the last, in the order the catalogue published them, with a reader of GCAT's rows and the exclusions file, and the states the last run returned; it keeps the states between runs with `serialiseStates` and `reviveStates`.

## Quick start

Read the ground truth the package ships and print the three most recent cases:

```js
import file from "@orbinauts/rendezvous/rendezvous.json" with { type: "json" };

for (const c of file.cases.slice(-3)) {
  console.log(c.id, c.chaser.name, "and", c.target.name, c.regime, "confidence", c.confidence);
}
```

## Live run

Every hour, a scheduled job (`.github/workflows/live.yml`) pulls the sets the catalogue published since the last run and reads them through the detector frozen at the tag `frozen-beside-v1`, from the states the last run ended with. Every verdict is logged on the `live` branch, whose commit time is the proof of when it was known, and the holds fit to show are published as JSON on this repository's GitHub Pages ([docs/published.md](docs/published.md)), with an issue for each hold once confirmed. [docs/live.md](docs/live.md) describes the run, its record and how to run it elsewhere.

## Learn more

- [The ground truth](docs/ground-truth.md): what counts as a rendezvous, its sources and how they are resolved; [docs/truth.md](docs/truth.md) lists every case.
- [The detector](docs/detector.md): every rule and threshold.
- [The scorecard](kpi/latest.md): every case, every hold raised, and what became of it.
- [The replay of step 2](docs/replay/README.md): what the first prototype found, day by day, and why the detector is built as it is.
- [The live run](docs/live.md): the hourly run of the frozen detector, its log and its seed.
- [The published files](docs/published.md): the JSON the live run publishes.
- [The Archive](docs/archive.md): the spans of element sets the scorecard replays, kept local, and how to pull them.
- [Design decisions](docs/decisions): why the project is built the way it is.
- [Changelog](CHANGELOG.md), [Contributing](CONTRIBUTING.md), [Security](SECURITY.md).

## Licence and data credits

The code is under the [MIT licence](LICENSE), © Orbinauts contributors. The data comes from public sources, each cited where it is used:

- **GCAT**, by Jonathan McDowell, planet4589.org, under CC-BY-4.0: the satellite catalogue and the organisations table.
- **Space-Track.org**: the element sets, under its user agreement; nothing of them is redistributed here beyond what the detector derives.
- The analysts, tracking companies, institutes, operators and news reports cited on each statement of the ground truth: Marco Langbroek, Jonathan McDowell, Bart Hendrickx, Nico Janssen and the Seesat-L observers, Pavel Podvig, Anatoly Zak; LeoLabs, COMSPOC, Slingshot Aerospace, Kratos, Integrity ISR, s2a systems; CSIS and the Secure World Foundation; Astroscale, Northrop Grumman, Intelsat and Optus; and the publications named on each row.
