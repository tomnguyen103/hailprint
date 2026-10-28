"""The publish run: the site data files per storm date, the storms index, and the pipeline file.

The caller holds the publish lock. A run reads the directories of `Dirs` and writes under
`Dirs.site`.
"""

import sys
from datetime import date, datetime
from pathlib import Path
from typing import NamedTuple

import geopandas as gpd
import pandas as pd

from hailprint import (
    archive,
    candidates,
    files,
    internet,
    power,
    publish,
    reports,
    runs,
    sbw,
    swath,
)


class Dirs(NamedTuple):
    """The directories of one publish run."""

    parcels: Path
    warnings: Path
    power: Path
    internet: Path
    site: Path


def archive_summary() -> dict | None:
    """The archive coverage from the archive index, or None without an index."""
    if not archive.INDEX_PATH.exists():
        return None
    try:
        return publish.archive_summary(pd.read_parquet(archive.INDEX_PATH))
    except (OSError, ValueError, KeyError) as exc:
        raise ValueError(
            f"{archive.INDEX_PATH}: not a readable archive index, run hailprint index again"
        ) from exc


def pipeline_doc(
    old_runs: list[dict],
    storm_dates: list[str],
    receipts: list[dict],
    summary: dict | None,
    file_count: int,
    run_time: datetime,
) -> dict:
    """Build the pipeline document: this run, the archive coverage, the sources.

    `storm_dates` are the dates of this run. `receipts` are the pairs and ZIP count receipts of
    every published storm date, so the sources cover the whole index and not this run alone.
    """
    run = publish.run_entry(storm_dates, file_count, run_time)
    return publish.pipeline_doc(
        publish.merge_runs(old_runs, run), summary, publish.sources_of(receipts), run_time
    )


_LAYER_SOURCE = {
    "warnings": publish.warnings_source,
    "power": publish.power_source,
    "internet": publish.internet_source,
}


def impact_layer(
    kind: publish.LayerKind, path: Path, storm_date: date, run_time: datetime
) -> tuple[pd.DataFrame, publish.Doc] | None:
    """The frame and the source entry of one impact layer, or None for a missing or bad file.

    An internet file without a ratio also gives None. A bad file is one that cannot be read,
    lacks the source metadata, or fails the document build (a missing column, a wrong column
    type, a county whose steps differ from the window). A dry run of `publish.layer_doc`,
    `validate`, and `dumps` runs here, so such a file skips only the layer of its date.
    """
    if not path.exists():
        return None
    try:
        frame = (gpd.read_parquet if kind == "warnings" else pd.read_parquet)(path)
        if kind == "internet" and not bool(frame["ratio"].notna().any()):
            return None
        source = _LAYER_SOURCE[kind](path)
        doc = publish.layer_doc(kind, frame, source, storm_date, run_time)
        publish.validate(doc, kind)
        publish.dumps(doc, kind)
    except runs.UNREADABLE as exc:  # an explicit `<kind> <date>` run rebuilds the file
        print(f"{path.name}: unreadable, {kind} layer skipped: {exc!r}", file=sys.stderr)
        return None
    return frame, source


def stale_files(written: list[Path], with_internet: bool, site: Path) -> set[Path]:
    """The existing published files that this run leaves stale.

    A stale file is a ZIP count, warnings, power, or internet file of a date that this run
    published, when this run did not write that file. A run without `--with-internet` also makes
    every internet file stale, also of a date that this run does not publish.
    """
    names = (publish.ZIPS_FILE, publish.WARNINGS_FILE, publish.POWER_FILE, publish.INTERNET_FILE)
    stale = {folder / name for folder in {path.parent for path in written} for name in names}
    if not with_internet:
        stale |= set((site / publish.STORMS_DIR).glob(f"*/{publish.INTERNET_FILE}"))
    return {path for path in stale - set(written) if path.exists()}


def remove_stale(paths: set[Path], with_internet: bool) -> None:
    """Remove the stale files after the index write. A failed removal prints one line."""
    for path in sorted(paths):
        try:
            path.unlink()
        except OSError as exc:
            print(f"{path.parent.name}/{path.name}: not removed: {exc}", file=sys.stderr)
        else:
            if path.name == publish.INTERNET_FILE and not with_internet:
                print(f"{path.parent.name}: removed {path.name}, this run has no --with-internet")


def run(
    selected: list[tuple[date, Path]], dirs: Dirs, *, with_internet: bool, now: datetime
) -> list[Path]:
    """Write the site data files per storm date, then the storms index, then the pipeline file.

    A date without an SPC daily CSV is skipped. A date that fails a check writes no file and is
    named in the final error. A bad warnings, power, or internet file skips that layer of its
    date and fails nothing.
    The index holds the dates of this run over the entries of the earlier runs.
    A malformed storms.json, pipeline.json, or archive index stops the run before any write. A
    malformed per-date file of an earlier run, or a pipeline document that fails its schema,
    stops the run before the index write. Without `with_internet` no date gets an internet.json
    and a stale one is removed. The run removes every stale file after the index write, so a run
    that fails before the write leaves the old index and the old files together.
    """
    if not candidates.CANDIDATES_PATH.exists():
        raise FileNotFoundError(f"run hailprint candidates first: {candidates.CANDIDATES_PATH}")
    facts = candidates.read_facts(candidates.CANDIDATES_PATH)
    index_path = dirs.site / "storms.json"
    pipeline_path = dirs.site / publish.PIPELINE_FILE
    old = publish.read_published(index_path, "storms")["storms"] if index_path.exists() else []
    old_runs = (
        publish.read_published(pipeline_path, "pipeline")["runs"] if pipeline_path.exists() else []
    )
    summary = archive_summary()
    run_time = now
    entries, written, failed = [], [], []
    file_count = 0
    for storm_date, swath_path in selected:
        try:
            text = candidates.daily_csv(storm_date, candidates.DAILY_DIR, date.today())
        except RuntimeError as exc:
            print(f"{storm_date}: SPC fetch failed, skipped: {exc!r}", file=sys.stderr)
            continue
        if text is None:
            print(f"{storm_date}: no SPC daily CSV, skipped", file=sys.stderr)
            continue
        zips_path = dirs.parcels / f"zip-counts-{storm_date}.parquet"
        has_zips = zips_path.exists()
        spc = publish.spc_source(storm_date)
        hcad = publish.hcad_source(zips_path.name) if has_zips else None
        try:
            mrms, max_mesh_mm = publish.swath_source(swath_path)
            texts, entry = publish.build_day(
                storm_date,
                gpd.read_parquet(swath_path),
                reports.nearby_reports(storm_date, text),
                mrms=mrms,
                max_mesh_mm=max_mesh_mm,
                spc=spc,
                zips=pd.read_parquet(zips_path) if has_zips else None,
                hcad=hcad,
                facts=facts.get(storm_date.isoformat()),
                run_time=run_time,
                warnings=impact_layer(
                    "warnings", dirs.warnings / sbw.file_name(storm_date), storm_date, run_time
                ),
                power=impact_layer(
                    "power", dirs.power / power.day_file_name(storm_date), storm_date, run_time
                ),
                internet=impact_layer(
                    "internet", dirs.internet / internet.file_name(storm_date), storm_date, run_time
                )
                if with_internet
                else None,
            )
        except runs.UNREADABLE as exc:  # a required file fails its date; the other dates publish
            detail = f"{type(exc).__name__}: {exc}" if isinstance(exc, ValueError) else repr(exc)
            print(f"{storm_date}: {detail}", file=sys.stderr)
            failed.append(storm_date.isoformat())
            continue
        folder = dirs.site / publish.STORMS_DIR / storm_date.isoformat()
        for name, body in texts.items():
            written.append(files.write_text_atomic(body, folder / name))
        entries.append(entry)
        file_count += len(texts)
        print(f"{storm_date}: published {len(texts)} files")
    if not entries:
        raise RuntimeError(
            "no storm date was published" + (f"; failed: {', '.join(failed)}" if failed else "")
        )
    stale = stale_files(written, with_internet, dirs.site)
    merged = publish.merge_entries(old, entries, dirs.site, absent=frozenset(stale))
    receipts = publish.index_receipts(merged, dirs.site)
    doc = publish.storms_doc(merged, run_time)
    this_run = [entry["storm_date"] for entry in entries]
    pipeline = pipeline_doc(old_runs, this_run, receipts, summary, file_count, run_time)
    # both documents pass validate and dumps before the first index write
    publish.validate(doc, "storms")
    publish.validate(pipeline, "pipeline")
    index_text = publish.dumps(doc, "storms")
    pipeline_text = publish.dumps(pipeline, "pipeline")
    written.append(files.write_text_atomic(index_text, index_path))
    print(f"storms index: {len(doc['storms'])} entries")
    written.append(files.write_text_atomic(pipeline_text, pipeline_path))
    print(f"published {publish.PIPELINE_FILE} ({len(pipeline['runs'])} runs)")
    remove_stale(stale, with_internet)
    print(f"confidence: {swath.CONFIDENCE}")
    if failed:
        raise ValueError(f"publish failed for: {', '.join(failed)}")
    return written
