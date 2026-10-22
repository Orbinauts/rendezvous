# The Archive

The element sets the scorecard replays: for each span of `data/spans.json`, a day slice per day, every object, as the catalogue's history class answers a query for a day of epochs (`{"pulledAt": <ISO>, "rows": [<OMM rows>]}`, gzipped), in the form breakups keeps them, under `<archive>/history/<year>/<day>.json.gz`. The Archive's home is `RENDEZVOUS_ARCHIVE`, default `../rendezvous-archive`; breakups' Archive beside it (`../breakups-archive`) is read where it holds a day.

- `npm run archive:pull-days -- <from> <to>` pulls days from Space-Track (credentials from the environment, one request a day, spaced out, ledgered in `requests.log`).
- `npm run archive:export -- <from> <to>` writes a span's day slices from breakups' Archive (its slices or its yearly columns) into this Archive, so a span is held whole here, apart from breakups.

The Archive stays on the machine that replays it. Nothing of it is uploaded: the scorecard (`npm run kpi -- --gcat <dir>`) is run locally and its aggregate, `kpi/latest.json`, is committed with the hashes of the detector, the truth and the exclusions it was made with; CI checks those against what the package ships (`test/kpi.test.ts`) and never replays. A reader who wants to make the aggregate again pulls the spans of `data/spans.json` from Space-Track with `archive:pull-days`.

A year's columns from breakups' bundles keep the order of publication but not its time: a set from them is read on the day of its epoch, and the scorecard says so per span.
