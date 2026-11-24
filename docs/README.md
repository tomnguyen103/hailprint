# Documentation

Every document in the repo, grouped by purpose. The guides in this folder describe the current code. The plans, reports, and audits are historical records and stay as written.

## Guides

| Document | Contents |
|---|---|
| [getting-started.md](getting-started.md) | Requirements, install, the data sources, the CLI commands, and the checks |
| [operations.md](operations.md) | The Trigger.dev tasks, the Supabase Storage buckets, and the environment variables |
| [DECISIONS.md](DECISIONS.md) | The adopted answers and the standing constraints |
| [../site/README.md](../site/README.md) | The site commands, routes, data path, basemap, Vercel fields, and dev harness |
| [../GLOSSARY.md](../GLOSSARY.md) | The domain terms used in code, tests, commits, and chat |
| [../design.md](../design.md) | The locked design system: tokens, archetypes, and layout rules |

## Design and audits

| Document | Contents |
|---|---|
| [design/direction.md](design/direction.md) | The design direction record of the shell build and its recommendations; `design.md` wins |
| [design/ui-evidence.md](design/ui-evidence.md) | The capture evidence of the UI work, with the captures under [design/captures/](design/captures/) |
| [audits/ui-audit-2026-11-24.md](audits/ui-audit-2026-11-24.md) | The UI audit and update plan of 2026-11-24 |

## Plans

[plans/consolidated-roadmap.md](plans/consolidated-roadmap.md) is the one ledger of every phase. The other plans follow, newest first.

| Document | Contents |
|---|---|
| [plans/consolidated-roadmap.md](plans/consolidated-roadmap.md) | Every phase with its plan, its pull requests, and its status, plus the open items |
| [plans/live-data.md](plans/live-data.md) | Plan for the live data refresh on Trigger.dev and Supabase Storage (shipped) |
| [plans/refactor-review.md](plans/refactor-review.md) | The refactor plan from the 2026-10-28 codebase review |
| [plans/plan-v6.md](plans/plan-v6.md) | Plan for PRs I to N: warnings, power, and internet layers on one time-slider map (shipped) |
| [plans/plan-v5.md](plans/plan-v5.md) | Plan of record for PRs A to H: audit findings, site architecture, viewer actions |
| [plans/plan-v4.md](plans/plan-v4.md) | Approved week-1 plan: pitch, evidence, scope, scorecard design, licences, risks, budget; the kickoff prompt is its appendix |
| [plans/research.md](plans/research.md) | The research before plan v4: the scoring rubric and the receipts of lanes A, B, and C |

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

## Solutions

Learn-loop entries: one problem, its root cause, and the fix.

| Document | Contents |
|---|---|
| [solutions/data/derived-parquet-metadata.md](solutions/data/derived-parquet-metadata.md) | Every derived Parquet file carries source, product, and confidence metadata |
| [solutions/data/hand-written-fixture-hid-the-live-feed-keys.md](solutions/data/hand-written-fixture-hid-the-live-feed-keys.md) | A hand-written fixture hid the real IEM warning key names |
| [solutions/data/mcc-is-a-modelled-count-and-eaglei-can-exceed-it.md](solutions/data/mcc-is-a-modelled-count-and-eaglei-can-exceed-it.md) | The MCC is a modelled count, and an EAGLE-I utility count can pass it |
| [solutions/data/spc-daily-county-case.md](solutions/data/spc-daily-county-case.md) | The SPC daily CSV spells some county names in upper case |
| [solutions/geo/epsg-2278-survey-feet.md](solutions/geo/epsg-2278-survey-feet.md) | EPSG:2278 buffers are in US survey feet, not metres |
| [solutions/geo/read-mask-changes-parcel-counts.md](solutions/geo/read-mask-changes-parcel-counts.md) | A change to the parcel read mask changes the parcel counts |
| [solutions/site/maplibre-css-loads-late-and-wins-ties.md](solutions/site/maplibre-css-loads-late-and-wins-ties.md) | The MapLibre stylesheet loads late and wins ties of equal specificity |
| [solutions/site/maplibre-error-event-fires-per-tile.md](solutions/site/maplibre-error-event-fires-per-tile.md) | MapLibre fires one error event per failed tile |
| [solutions/site/maplibre-match-requires-integer-labels.md](solutions/site/maplibre-match-requires-integer-labels.md) | MapLibre match expressions require integer numeric labels |
| [solutions/site/maplibre-paint-before-style-load.md](solutions/site/maplibre-paint-before-style-load.md) | MapLibre paint changes before the style loads |
| [solutions/site/render-throw-needs-an-error-boundary.md](solutions/site/render-throw-needs-an-error-boundary.md) | A render throw in a page body needs an error boundary |
| [solutions/site/theme-store-matchmedia-at-import.md](solutions/site/theme-store-matchmedia-at-import.md) | The theme store reads matchMedia at import |
| [solutions/site/use-load-returns-old-key-data-for-one-render.md](solutions/site/use-load-returns-old-key-data-for-one-render.md) | A load hook that resets in an effect returns the old key data for one render |
| [solutions/site/vite-lightningcss-lab-breaks-maplibre-colors.md](solutions/site/vite-lightningcss-lab-breaks-maplibre-colors.md) | Vite LightningCSS lab() custom properties break MapLibre and hexRgb consumers |
| [solutions/tooling/coderabbit-reports-a-check-run-not-a-status.md](solutions/tooling/coderabbit-reports-a-check-run-not-a-status.md) | CodeRabbit posts a check run, so a poll of the commit status finds nothing |
| [solutions/tooling/gated-publish-must-clear-stale-files-of-every-date.md](solutions/tooling/gated-publish-must-clear-stale-files-of-every-date.md) | A gated publish layer clears its stale files for every date, and one bad file does not stop the run |
| [solutions/tooling/git-bash-grep-drops-cr.md](solutions/tooling/git-bash-grep-drops-cr.md) | A CRLF guard passes on Git Bash when it reads through grep |
| [solutions/tooling/new-layer-needs-a-publish-command-test.md](solutions/tooling/new-layer-needs-a-publish-command-test.md) | A new impact layer needs a publish command test, not only a build_day test |
| [solutions/tooling/public-bucket-stray-object-bricks-nightly-sync.md](solutions/tooling/public-bucket-stray-object-bricks-nightly-sync.md) | Non-allowlisted objects in the public bucket skip cleanly during sync_down |
| [solutions/tooling/site-test-files-hold-no-banned-literal.md](solutions/tooling/site-test-files-hold-no-banned-literal.md) | Site test files must not hold a banned literal, because the Python source scans read them |
| [solutions/tooling/powershell-5-json-and-jq-quoting.md](solutions/tooling/powershell-5-json-and-jq-quoting.md) | PowerShell 5.1 unrolls a JSON array and strips the quotes of a `--jq` program |
| [solutions/tooling/powershell-bash-is-wsl-use-git-bash.md](solutions/tooling/powershell-bash-is-wsl-use-git-bash.md) | `bash` in PowerShell is WSL, so a script needs the Git Bash path |
| [solutions/tooling/subagent-receipt-numbers-need-a-rerun.md](solutions/tooling/subagent-receipt-numbers-need-a-rerun.md) | A subagent receipt with real-data numbers needs an independent re-run |
| [solutions/tooling/trigger-live-small-1x-oom-on-conus-grib2.md](solutions/tooling/trigger-live-small-1x-oom-on-conus-grib2.md) | The live task on small-1x runs out of memory on a CONUS GRIB2 file |
| [solutions/tooling/uv-standalone-python-symlink-breaks-venv-ensurepip.md](solutions/tooling/uv-standalone-python-symlink-breaks-venv-ensurepip.md) | A partial symlink of uv standalone Python breaks `python3 -m venv` in Docker |
| [solutions/tooling/windows-file-writes-from-agents.md](solutions/tooling/windows-file-writes-from-agents.md) | File writes from an agent on this Windows host |

## Drafts

| Document | Contents |
|---|---|
| [drafts/hcad-gis-reuse-email.md](drafts/hcad-gis-reuse-email.md) | The HCAD GIS reuse-terms request, a draft for the owner to send |
