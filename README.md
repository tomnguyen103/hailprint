# Hailprint

An open hail-exposure map for Harris County, Texas, that grades itself.

Every night the pipeline pulls NOAA's MRMS hail-size product (MESH), draws the hail swath over every Harris County parcel, and scores the result against NOAA storm reports. The output is a live map, a per-storm exposure report, and a public verification table (POD, FAR, CSI, HSS per storm and per season).

Status: week 2 done on 2026-10-25. Reports: `docs/WEEK-01.md`, `docs/WEEK-02.md`.

## Commands

```bash
make setup                                  # uv sync
uv run hailprint ingest 2024-05-28          # swath file and PNG for one or more SPC convective days
uv run hailprint index                      # one row per MESH archive day from one bucket listing
uv run hailprint candidates --top 20        # first run fetches about 300 daily CSVs (about 10 min), later runs read the cache; Harris County hail days ranked by SPC report count (WCM, plus preliminary daily CSVs after the WCM end; a `spc-daily` row can still change)
uv run hailprint parcels 2024-05-28         # allow-listed parcel count per size class
make lint                                   # ruff check, ruff format --check, pyright
make test                                   # uv run pytest -q
```

## Documents

| File | Purpose |
|---|---|
| `docs/plan-v4.md` | The approved plan: pitch, evidence, scope, scorecard design, architecture, data licences, risks, 12-week schedule, budget, sources |
| `docs/plan-v4.html` | The same plan as a standalone page |
| `docs/DECISIONS.md` | The six decisions from plan section 16, with the adopted answers |
| `docs/KICKOFF.md` | The prompt that starts week 1 in this folder |
| `docs/research/` | Research receipts behind the pick: scoring rubric and the three candidate lanes |

## Rules that never change

- Outputs say "radar-estimated hail size at this parcel" with a confidence band. They never say "damaged".
- No homeowner names, mailing addresses, or contact data, ever. Owner fields are stripped from HCAD parcels at load time.
- The published skill ceiling for radar hail estimates is low (Heidke skill score about 0.38 against dense ground truth). Lead with it.
- No secrets in the repo. Credentials live in environment variables; the variable name is documented, the value is not.
