import geopandas as gpd
import matplotlib.pyplot as plt
import pytest
from matplotlib.colors import to_hex
from shapely.geometry import MultiPolygon, box

from hailprint import plot
from hailprint.swath import COLUMNS, SIZE_CLASSES_MM

RAMP = ["#DCEBF2", "#A9D2E3", "#6FB0CF", "#3F86B8", "#2E5E9E", "#33397A", "#2A1748"]


def _swaths(thresholds):
    rows = [
        {
            "storm_date": "2024-05-28",
            "threshold_mm": t,
            "threshold_in": t / 25.4,
            "label": f"radar-estimated hail size >= {t / 25.4:.2f} in",
            "geometry": MultiPolygon([box(-95.5, 29.8, -95.5 + 0.1 * (i + 1), 29.9)]),
        }
        for i, t in enumerate(thresholds)
    ]
    return gpd.GeoDataFrame(rows, columns=COLUMNS, geometry="geometry", crs="EPSG:4326")


def _outline():
    return gpd.GeoDataFrame(geometry=[box(-96, 29.5, -95, 30.2)], crs="EPSG:4326")


def _swath_facecolors(thresholds, tmp_path, monkeypatch):
    figures = []
    monkeypatch.setattr(plt, "close", figures.append)
    plot.render(_swaths(thresholds), _outline(), None, "t", tmp_path / "x.png")
    ax = figures[0].axes[0]
    # one collection per class, in frame order, then the county outline
    return [to_hex(c.get_facecolor()[0]) for c in ax.collections[: len(thresholds)]]


def test_class_colors_follow_the_design_ramp_in_class_order():
    assert list(plot.CLASS_COLORS) == RAMP
    assert len(plot.CLASS_COLORS) == len(SIZE_CLASSES_MM)


def test_color_for_returns_the_ramp_hex_per_class():
    assert plot.color_for(25.4) == "#A9D2E3"
    assert plot.color_for(19.05) == "#DCEBF2"
    assert plot.color_for(63.5) == "#2A1748"


def test_color_for_rejects_a_threshold_outside_the_size_classes():
    with pytest.raises(KeyError):
        plot.color_for(99.0)


def test_a_size_class_keeps_its_colour_whatever_other_classes_are_drawn(tmp_path, monkeypatch):
    both = _swath_facecolors([19.05, 25.4], tmp_path, monkeypatch)
    alone = _swath_facecolors([25.4], tmp_path, monkeypatch)

    assert both[1] == alone[0] == "#a9d2e3"
