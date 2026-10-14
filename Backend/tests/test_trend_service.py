from datetime import date

from app.services.trendservice import (
    compute_trends,
    mann_kendall,
    period_change,
    rolling_mean,
    sens_slope,
)


def test_mann_kendall_monotonic_increase_is_significant():
    result = mann_kendall([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    assert result["s"] == 45
    assert result["significant"] is True
    assert result["direction"] == "increasing"
    assert result["p_value"] < 0.001


def test_mann_kendall_constant_series_is_not_significant():
    result = mann_kendall([3, 3, 3, 3, 3, 3])
    assert result["s"] == 0
    assert result["p_value"] == 1.0
    assert result["significant"] is False


def test_mann_kendall_too_short():
    assert mann_kendall([1, 2, 3]) is None


def test_sens_slope_and_rolling_and_change():
    assert sens_slope([2000, 2001, 2002, 2003], [0, 2, 4, 6]) == 2.0
    assert rolling_mean([1, 2, 3, 4], 3) == [None, None, 2.0, 3.0]
    change = period_change([1, 2, 3, 4], [1, 1, 3, 3])
    assert change["percent_change"] == 200.0


def test_zero_baseline_gives_no_percentage():
    assert period_change([1, 2, 3, 4], [0, 0, 2, 2])["percent_change"] is None


def _records(start_year, end_year, missing_year=None):
    out = []
    for year in range(start_year, end_year + 1):
        for month in range(1, 13):
            for day in range(1, 29):
                temp = None if year == missing_year else 30.0
                out.append({"date": f"{year}-{month:02d}-{day:02d}", "temperature_max": temp})
    return out


def test_compute_trends_excludes_low_coverage_year_and_reports_insight():
    events = [
        {"start_date": f"{y}-05-01", "end_date": f"{y}-05-03", "duration_days": 3 + (y - 2000) // 4}
        for y in range(2000, 2016)
    ]
    # 28 days/month = 336 valid days of 365/366 -> ~92% coverage (valid)
    result = compute_trends(events, _records(2000, 2015, missing_year=2007), date(2000, 1, 1), date(2015, 12, 31))
    row_2007 = next(r for r in result["annual"] if r["year"] == 2007)
    assert row_2007["valid"] is False
    assert result["insight"]["level"] in {"significant", "not_significant"}
    assert "excluded for missing data" in result["insight"]["text"]


def test_short_period_is_insufficient():
    result = compute_trends([], _records(2018, 2020), date(2018, 1, 1), date(2020, 12, 31))
    assert result["insight"]["level"] == "insufficient"
