# Documentation

Every document in the repo, grouped by purpose. The guides in this folder describe the current code. The plans, reports, and research are historical records and stay as written.

## Guides

| Document | Contents |
|---|---|
| [getting-started.md](getting-started.md) | Requirements, install, the data sources, the CLI commands, and the checks |
| [operations.md](operations.md) | The nightly run, the cron entry, the Vercel deploy, and the `.env` rules |
| [DECISIONS.md](DECISIONS.md) | The adopted answers and the standing constraints |
| [../site/README.md](../site/README.md) | The site commands, routes, data path, basemap, Vercel fields, and dev harness |
| [../GLOSSARY.md](../GLOSSARY.md) | The domain terms used in code, tests, commits, and chat |

## Plans

Newest first.

| Document | Contents |
|---|---|
| [plans/plan-v6.md](plans/plan-v6.md) | Draft plan for PRs I to N: warnings, power, and internet layers on one time-slider map |
| [plans/plan-v5.md](plans/plan-v5.md) | Plan of record for PRs A to H: audit findings, site architecture, viewer actions |
| [plans/plan-v4.md](plans/plan-v4.md) | Approved week-1 plan: pitch, evidence, scope, scorecard design, licences, risks, budget |
| [plans/plan-v4.html](plans/plan-v4.html) | The v4 plan as a standalone page |
| [plans/kickoff.md](plans/kickoff.md) | The prompt that started week 1 |

## Weekly reports

Screenshots and other evidence live under [reports/evidence/](reports/evidence/).

| Document | Contents |
|---|---|
| [reports/week-01.md](reports/week-01.md) | Week 1: the spike, one 12Z file per storm date |
| [reports/week-02.md](reports/week-02.md) | Week 2: aligned ingest, archive index, candidate days, parcel counts |
| [reports/week-03.md](reports/week-03.md) | Week 3: the verification scorer (PR C) |
| [reports/week-04.md](reports/week-04.md) | Week 4: the published files for the site (PR D) |
| [reports/week-05.md](reports/week-05.md) | Week 5: the site shell and the Storms workspace (PR E) |
| [reports/week-06.md](reports/week-06.md) | Week 6: Scorecard and Try it (PR F) |
| [reports/week-07.md](reports/week-07.md) | Week 7: Method and Pipeline (PR G) |
| [reports/week-08.md](reports/week-08.md) | Week 8: ship preparation (PR H), the dry run, and the owner runbook |

## Research

| Document | Contents |
|---|---|
| [research/scoring.md](research/scoring.md) | The v4 scoring rubric for the three candidate lanes |
| [research/lane-a-ercot.md](research/lane-a-ercot.md) | Lane A receipt: the ERCOT coincident-peak predictor |
| [research/lane-b-hail.md](research/lane-b-hail.md) | Lane B receipt: the hail swath mapper, the lane that became Hailprint |
| [research/lane-c-cartonization.md](research/lane-c-cartonization.md) | Lane C receipt: the cartonization engine |

## Solutions

Learn-loop entries: one problem, its root cause, and the fix.

| Document | Contents |
|---|---|
| [solutions/data/derived-parquet-metadata.md](solutions/data/derived-parquet-metadata.md) | Every derived Parquet file carries source, product, and confidence metadata |
| [solutions/data/spc-daily-county-case.md](solutions/data/spc-daily-county-case.md) | The SPC daily CSV spells some county names in upper case |
| [solutions/geo/epsg-2278-survey-feet.md](solutions/geo/epsg-2278-survey-feet.md) | EPSG:2278 buffers are in US survey feet, not metres |
| [solutions/geo/read-mask-changes-parcel-counts.md](solutions/geo/read-mask-changes-parcel-counts.md) | A change to the parcel read mask changes the parcel counts |
| [solutions/site/maplibre-paint-before-style-load.md](solutions/site/maplibre-paint-before-style-load.md) | MapLibre paint changes before the style loads |
| [solutions/site/theme-store-matchmedia-at-import.md](solutions/site/theme-store-matchmedia-at-import.md) | The theme store reads matchMedia at import |
| [solutions/tooling/git-bash-grep-drops-cr.md](solutions/tooling/git-bash-grep-drops-cr.md) | A CRLF guard passes on Git Bash when it reads through grep |
| [solutions/tooling/subagent-receipt-numbers-need-a-rerun.md](solutions/tooling/subagent-receipt-numbers-need-a-rerun.md) | A subagent receipt with real-data numbers needs an independent re-run |
| [solutions/tooling/windows-file-writes-from-agents.md](solutions/tooling/windows-file-writes-from-agents.md) | File writes from an agent on this Windows host |

## Drafts

| Document | Contents |
|---|---|
| [drafts/hcad-gis-reuse-email.md](drafts/hcad-gis-reuse-email.md) | The HCAD GIS reuse-terms request, a draft for the owner to send |
