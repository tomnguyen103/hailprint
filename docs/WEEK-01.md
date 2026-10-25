# Week 1 — spike

Goal: one PNG of a MESH hail swath over the Harris County outline for one real storm day.

Oracle: 10 of 10 SPC Harris County reports fall inside the 19.05 mm swath buffered 5 km (target was 7 of 10). Six size classes present; the 63.5 mm class is empty.

## Spike result

| Item | Value |
|---|---|
| Storm date | 2024-05-28 |
| SPC hail reports in Harris County | 10 |
| Max MESH in bbox | 52.8 mm |
| PNG | `out/spike-2024-05-28.png` |
| Swath file | `data/derived/swaths/swaths-2024-05-28.parquet` |
| Test command | `make test` (`uv run pytest -q`) |
| Test result | 22 passed (lint and format clean), 2026-10-24 |

Run it:

```bash
make setup && make spike DATE=2024-05-28
```

Output wording: "radar-estimated hail size" with a confidence band. The outputs never claim damage.

## Admin checklist

- [x] HCAD parcel data downloaded. The public download is a FileGDB (`Parcels.gdb`, layer `Parcels`, 1,546,850 rows, EPSG:2278), not a shapefile. Stored under `data/raw/hcad/` (gitignored).
- [x] Owner fields to strip at load: `CurrOwner`, `mail_addr_1`, `mail_addr_2`, `mail_city`, `mail_state`, `mail_zip`, and the situs fields `LocAddr`, `LocNum`, `LocName`. The loader reads an allow-list only (`HCAD_NUM_1`, `LOWPARCELID`, `zip`, `city`, `yr_impr`, `StatedArea`, `Stacked`, geometry). `tests/test_outputs_clean.py` proves the owner fields are absent from every written file.
- [x] HCAD GIS reuse-terms email drafted: `docs/drafts/hcad-gis-reuse-email.md`. **Tom: confirm the recipient on hcad.org and send.**
- [x] USPTO trademark search (tmsearch.uspto.gov, 2026-10-24): the mark "hailprint" returns no results. No live or dead US mark with that wordmark exists.
- [x] Domain check (RDAP + DNS, 2026-10-24): `hailprint.com`, `.org`, `.io`, `.app`, `.dev` have no registration record. Register before the name is public.
- [ ] **Tom: read the employer IP assignment clause before the first commit of pipeline code reaches the remote.** The kickoff asked for a PR, so the branch is on the private remote; nothing is merged until you confirm.

## Carried rules

- No homeowner names, mailing addresses, or contact data in any file.
- No secrets in the repo. Name the environment variable, never its value.
- `data/` and `out/` stay out of git.
