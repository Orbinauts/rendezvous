# The live run

The detector, frozen at the tag `frozen-beside-v1`, reads every set the catalogue publishes, an hour at a time, and publishes the holds it finds as JSON on this repository's GitHub Pages. This is the prospective test of the detector and the source the site reads; [docs/decisions/0006](decisions/0006-the-live-run-is-hourly-from-a-frozen-tag.md) says why it is built so.

## What a run does

`.github/workflows/live.yml`, every hour at 23 past, on a fresh runner:

1. Checks out main (the scripts, the exclusions file and the ground truth), the frozen tag into `frozen/` (the detector, with `satellite.js` installed at 7.1.0, the version it was scored with), the `live` branch (the log) and the `published` branch (the files). The tag must still name the frozen commit; a moved tag is refused.
2. Downloads the last run's states and the GCAT snapshot from the release `live-data` (`npm run live:data -- download`), verifying each hash.
3. `npm run live` (`scripts/live/run.ts`): pulls from the catalogue's history class every set published since the last run, by `CREATION_DATE`, from the cursor `setsThrough` of the last line of `runs.jsonl`, a day at most per request, through the throttled client that writes each request to `requests.log`; reads them, in publication order, through the frozen detector from the stored states; appends every verdict raised to `verdicts.jsonl` on the `live` branch (one logged once, however many runs raise it), with a line for the run in `runs.jsonl`; commits and pushes the branch, whose commit time is the proof of when each verdict was known; then writes the states the run ended with and uploads them to the release. A run made again over the same sets, after a failed upload, logs nothing twice.
4. `npm run live:publish` (`scripts/live/publish.ts`): the whole log, selected against main's ground truth ([docs/published.md](published.md)), written into `v1/` on the `published` branch, committed and pushed; the Pages workflow then deploys it.
5. `npm run live:issues`: an issue labelled `rendezvous` for each published hold a later set has confirmed, naming the two objects and their owners, the geometry and the published file, and nothing of intent; one per hold.
6. Enables again any scheduled workflow GitHub disabled for the repository's inactivity. A failed run opens an issue labelled `maintenance` with the end of its log, one a failing day.

The GCAT snapshot is fetched again once a day; a fetch that fails keeps the snapshot held. The exclusions file and the truth are read from main at each run: a change to the data changes what the next run tags and lands, never what the frozen detector computes.

## The record

- **`live` branch:** `verdicts.jsonl`, every verdict since the seed (`LoggedVerdict`: the verdict, `loggedAt`, `runUrl`), and `runs.jsonl`, a line per run (`RunLine`: when, the frozen commit, the cursor read from and through, requests, sets, verdicts, holds, the states' hash, the GCAT day, the run's URL). Written by the runs only. A gap between lines is a time the run was not running.
- **`published` branch:** `v1/`, as [docs/published.md](published.md) describes.
- **Release `live-data`:** `states.json.gz` (the frozen detector's states after the last run, with `states.provenance.txt` saying what made them), the GCAT snapshot gzipped, and `manifest.json` with each asset's hash. Replaced by every run; not for reading by hand.

## The seed

The run was seeded once on the maintainer's machine (`npm run live:seed -- --from 2026-04-06 --gcat <dir>`, `scripts/live/seed.ts`): the local Archive replayed from that day through the day before, with the last days pulled afresh, through the frozen detector checked out at `../rendezvous-frozen`; every verdict of the replay logged on the `live` branch as the seed's, with one run line whose `setsThrough` is midnight after the cut; the published files selected from that log; the states and the GCAT snapshot uploaded to the release. The seed's verdicts carry the seed's logging time, not the hour they were raised: the proof of time starts with the first hourly run.

## Running it elsewhere

The run reads its places from the environment where it names them, as the workflow does: `RENDEZVOUS_ARCHIVE` (the run's directory is `live/` under it), `RENDEZVOUS_FROZEN` (a worktree at the tag: `git worktree add --detach ../rendezvous-frozen frozen-beside-v1`, then `npm install --no-save --ignore-scripts satellite.js@7.1.0` there), `RENDEZVOUS_LIVE` and `RENDEZVOUS_PUBLISHED` (worktrees of the two branches), with the catalogue's credentials in the environment (`node --env-file=<file>`, never a committed file). `npm run live -- --local` keeps the states on the machine instead of uploading them, for a trial.

To pause the run: `gh workflow disable live.yml`; to resume it: `gh workflow enable live.yml`. To freeze a new detector: tag the scored commit, set `FROZEN_TAG`, `FROZEN_COMMIT` and `FROZEN_PINS` in `scripts/live/frozen.ts` and the workflow, and seed again or carry the states on.
