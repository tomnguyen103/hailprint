"""The spike picture: size classes over the county outline with the SPC report points."""

from pathlib import Path

import geopandas as gpd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import Patch  # noqa: E402


def render(
    swaths: gpd.GeoDataFrame,
    outline: gpd.GeoDataFrame,
    reports: gpd.GeoDataFrame | None,
    title: str,
    path: Path,
) -> Path:
    """Save the PNG at 150 dpi: classes light to dark, outline in black, reports as triangles."""
    fig, ax = plt.subplots(figsize=(9, 8))
    colors = plt.get_cmap("YlOrRd")([i / max(len(swaths) - 1, 1) for i in range(len(swaths))])
    for color, geometry in zip(colors, swaths.geometry, strict=True):
        gpd.GeoSeries([geometry], crs=swaths.crs).plot(ax=ax, color=color, linewidth=0)
    outline.boundary.plot(ax=ax, color="black", linewidth=1)
    if reports is not None and len(reports):
        reports.plot(ax=ax, color="black", marker="^", markersize=reports["size_in"] * 60)
    handles = [
        Patch(color=color, label=label)
        for color, label in zip(colors, swaths["label"], strict=True)
    ]
    ax.legend(handles=handles, loc="lower left", fontsize=8)
    ax.set_title(title, fontsize=10)
    ax.set_xlabel("longitude")
    ax.set_ylabel("latitude")
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    return path
