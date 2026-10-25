import pytest

from hailprint.__main__ import main


@pytest.mark.parametrize("bad", ["2024-5-28", "20240528", "yesterday", "2024-13-01"])
def test_malformed_date_exits_2(bad, capsys):
    with pytest.raises(SystemExit) as exc:
        main(["spike", bad])
    assert exc.value.code == 2
    assert "usage" in capsys.readouterr().err
