"""The spike picture: size classes over the county outline with the SPC report points."""

from pathlib import Path

import geopandas as gpd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.lines import Line2D  # noqa: E402
from matplotlib.patches import Patch  # noqa: E402

from hailprint.swath import SIZE_CLASSES_MM  # noqa: E402

# design hail ramp, light to dark, parallel to SIZE_CLASSES_MM; the site map uses the same hex
CLASS_COLORS = ("#DCEBF2", "#A9D2E3", "#6FB0CF", "#3F86B8", "#2E5E9E", "#33397A", "#2A1748")
# the lightest class needs an edge to stay visible on a white page
EDGE_COLOR = "#5B6B73"
_COLOR_BY_CLASS = dict(zip(SIZE_CLASSES_MM, CLASS_COLORS, strict=True))


def color_for(threshold_mm: float) -> str:
    """Hex colour of one size class; KeyError for a threshold outside SIZE_CLASSES_MM."""
    return _COLOR_BY_CLASS[threshold_mm]


def render(
    swaths: gpd.GeoDataFrame,
    outline: gpd.GeoDataFrame,
    reports: gpd.GeoDataFrame | None,
    title: str,
    path: Path,
) -> Path:
    """Save the PNG at 150 dpi: classes light to dark, outline in black, reports as triangles."""
    fig, ax = plt.subplots(figsize=(9, 8))
    colors = [color_for(t) for t in swaths["threshold_mm"]]
    for color, geometry in zip(colors, swaths.geometry, strict=True):
        gpd.GeoSeries([geometry], crs=swaths.crs).plot(
            ax=ax, facecolor=color, edgecolor=EDGE_COLOR, linewidth=0.4
        )
    outline.boundary.plot(ax=ax, color="black", linewidth=1)
    if reports is not None and len(reports):
        reports.plot(ax=ax, color="black", marker="^", markersize=reports["size_in"] * 60)
    handles: list[Patch | Line2D] = [
        Patch(facecolor=color, edgecolor=EDGE_COLOR, linewidth=0.4, label=label)
        for color, label in zip(colors, swaths["label"], strict=True)
    ]
    if reports is not None and len(reports):
        handles.append(
            Line2D([], [], color="black", marker="^", linestyle="", label="SPC hail report")
        )
    ax.legend(handles=handles, loc="lower left", fontsize=8)
    ax.set_title(title, fontsize=9)
    ax.set_xlabel("longitude")
    ax.set_ylabel("latitude")
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    return path
