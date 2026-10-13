import pytest

from app.services.heatwaveservice import (
    calculate_seasonal_thresholds,
    detect_heatwaves,
)

def make_records(temperatures, start_date="2023-01-01"):
    from datetime import date, timedelta

    first_day = date.fromisoformat(start_date)

    return [
        {
            "date": (first_day + timedelta(days=index)).isoformat(),
            "temperature_max": temperature,
        }
        for index, temperature in enumerate(temperatures)
    ]


def test_calculates_seasonal_thresholds():
    baseline = make_records(
        [20, 22, 24, 26, 28],
        start_date="2000-01-01",
    )

    thresholds = calculate_seasonal_thresholds(
        baseline,
        percentile=95,
        window_days=15,
    )

    assert "01-01" in thresholds
    assert thresholds["01-01"] > 0

def test_detects_three_consecutive_hot_days():
    records = make_records([30, 36, 37, 38, 31])

    events = detect_heatwaves(records, threshold=35)

    assert len(events) == 1
    assert events[0]["start_date"] == "2023-01-02"
    assert events[0]["end_date"] == "2023-01-04"
    assert events[0]["duration_days"] == 3
    assert events[0]["peak_temperature"] == 38

def test_ignores_runs_shorter_than_three_days():
    records = make_records([36, 37, 30, 36, 37])

    events = detect_heatwaves(records, threshold=35)

    assert events == []

def test_missing_temperature_breaks_a_run():
    records = make_records([36, 37, None, 38, 39, 40])

    events = detect_heatwaves(records, threshold=35)

    assert len(events) == 1
    assert events[0]["start_date"] == "2023-01-04"
    assert events[0]["duration_days"] == 3

def test_date_gap_breaks_a_run():
    records = [
        {"date": "2023-01-01", "temperature_max": 36},
        {"date": "2023-01-02", "temperature_max": 37},
        {"date": "2023-01-04", "temperature_max": 38},
        {"date": "2023-01-05", "temperature_max": 39},
    ]

    events = detect_heatwaves(records, threshold=35)

    assert events == []

def test_threshold_excludes_baseline_outside_reference_period():
    records = [
        {"date": "1990-12-31", "temperature_max": 100},
        {"date": "2000-01-01", "temperature_max": 20},
        {"date": "2000-01-02", "temperature_max": 30},
        {"date": "2021-01-01", "temperature_max": 200},
    ]

    thresholds = calculate_seasonal_thresholds(
        records,
        percentile=95,
        window_days=15,
    )

    assert thresholds["01-01"] == pytest.approx(29.5)

def test_rejects_invalid_percentile():
    with pytest.raises(ValueError):
        calculate_seasonal_thresholds([], percentile=100, window_days=15)

def test_rejects_invalid_minimum_duration():
    with pytest.raises(ValueError):
        detect_heatwaves([], threshold=35, minimum_duration=0)
