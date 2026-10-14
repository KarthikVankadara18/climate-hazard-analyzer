from datetime import date, timedelta
import numpy as np

BASELINE_START = date(1991, 1, 1)
BASELINE_END = date(2020, 12, 31)
DEFAULT_PERCENTILE = 95
MINIMUM_HEATWAVE_DAYS = 3

CALENDAR_DAY_WINDOW = 15

def calculate_seasonal_thresholds(
    baseline_records: list[dict],
    percentile: float = DEFAULT_PERCENTILE,
    window_days: int = CALENDAR_DAY_WINDOW,
) -> dict[str, float]:
    """
    Calculate a separate temperature threshold for each
    calendar day using the fixed 1991-2020 baseline.

    Returns a dictionary keyed by MM-DD, for example:
        {"01-01": 29.4, "01-02": 29.5, ...}
    """
    if not 0 < percentile < 100:
        raise ValueError("Percentile must be between 0 and 100.")

    if window_days < 0:
        raise ValueError("Window size cannot be negative.")

    temperatures_by_day = {}

    for record in baseline_records:
        record_date = date.fromisoformat(record["date"])
        temperature = record.get("temperature_max")

        if not BASELINE_START <= record_date <= BASELINE_END:
            continue

        if temperature is None:
            continue

        temperature = float(temperature)

        if not np.isfinite(temperature):
            continue

        key = (record_date.month, record_date.day)
        temperatures_by_day.setdefault(key, []).append(
            (record_date, temperature)
        )

    thresholds = {}

    # A leap-year reference lets us iterate over all 366
    # possible month/day combinations, including February 29.
    reference_year = 2000

    for day_number in range(366):
        target = date(reference_year, 1, 1) + timedelta(
            days=day_number
        )

        samples = []

        for (month, day), records in temperatures_by_day.items():
            try:
                candidate = date(reference_year, month, day)
            except ValueError:
                continue

            distance = abs((candidate - target).days)

            distance = min(distance, 366 - distance)

            if distance <= window_days:
                samples.extend(
                    temperature
                    for _, temperature in records
                )

        if samples:
            thresholds[target.strftime("%m-%d")] = float(
                np.percentile(samples, percentile)
            )

    if not thresholds:
        raise ValueError(
            "No valid temperatures available for the baseline."
        )

    return thresholds


def detect_heatwaves(
    weather_records: list[dict],
    threshold: float | dict[str, float],
    minimum_duration: int = MINIMUM_HEATWAVE_DAYS,
) -> list[dict]:
    """
    Detect heatwaves using either one fixed threshold or
    seasonally varying thresholds keyed by MM-DD.

    Missing temperatures and missing dates break an event.
    """
    if minimum_duration < 1:
        raise ValueError("Minimum duration must be at least one day.")

    if isinstance(threshold, dict):
        if not threshold:
            raise ValueError("Seasonal thresholds cannot be empty.")

        if any(
            not np.isfinite(value)
            for value in threshold.values()
        ):
            raise ValueError("All thresholds must be finite.")
    elif not np.isfinite(threshold):
        raise ValueError("Threshold must be a finite number.")

    sorted_records = sorted(
        weather_records,
        key=lambda record: record["date"],
    )

    events = []
    current_run = []
    previous_date = None

    def save_event(run: list[dict]) -> None:
        if len(run) < minimum_duration:
            return

        temperatures = [
            record["temperature_max"]
            for record in run
        ]
        daily_thresholds = [
            record["threshold"]
            for record in run
        ]

        events.append(
            {
                "start_date": run[0]["date"],
                "end_date": run[-1]["date"],
                "duration_days": len(run),
                "peak_temperature": max(temperatures),
                "mean_temperature": round(
                    sum(temperatures) / len(temperatures), 2
                ),
                "mean_threshold": round(
                    sum(daily_thresholds) / len(daily_thresholds), 2
                ),
            }
        )

    for record in sorted_records:
        record_date = date.fromisoformat(record["date"])
        temperature = record.get("temperature_max")

        is_consecutive = (
            previous_date is None
            or record_date == previous_date + timedelta(days=1)
        )

        if current_run and not is_consecutive:
            save_event(current_run)
            current_run = []

        if temperature is None or not np.isfinite(float(temperature)):
            save_event(current_run)
            current_run = []
            previous_date = record_date
            continue

        if isinstance(threshold, dict):
            day_threshold = threshold.get(record_date.strftime("%m-%d"))

            if day_threshold is None:
                save_event(current_run)
                current_run = []
                previous_date = record_date
                continue
        else:
            day_threshold = float(threshold)

        temperature = float(temperature)

        if temperature > day_threshold:
            current_run.append(
                {
                    "date": record_date.isoformat(),
                    "temperature_max": temperature,
                    "threshold": float(day_threshold),
                }
            )
        else:
            save_event(current_run)
            current_run = []

        previous_date = record_date

    save_event(current_run)

    return events

def check_baseline_quality(
    baseline_records: list[dict],
    seasonal_thresholds: dict[str, float],
    window_days: int = CALENDAR_DAY_WINDOW,
) -> dict:
    """Summarize baseline completeness and seasonal sample coverage."""
    from collections import Counter
    from math import isfinite

    expected_days = (BASELINE_END - BASELINE_START).days + 1
    date_counts = Counter()
    valid_temperatures = []
    missing_temperatures = 0
    invalid_temperatures = 0
    outside_baseline = 0

    for record in baseline_records:
        record_date = date.fromisoformat(record["date"])

        if not BASELINE_START <= record_date <= BASELINE_END:
            outside_baseline += 1
            continue

        date_counts[record["date"]] += 1
        temperature = record.get("temperature_max")

        if temperature is None:
            missing_temperatures += 1
            continue

        try:
            temperature = float(temperature)
        except (TypeError, ValueError):
            invalid_temperatures += 1
            continue

        if not isfinite(temperature):
            invalid_temperatures += 1
            continue

        valid_temperatures.append((record_date, temperature))

    unique_dates = set(date_counts)
    duplicate_records = sum(
        count - 1 for count in date_counts.values() if count > 1
    )

    reference_year = 2000
    per_day = np.zeros(366, dtype=np.int64)
    for record_date, _ in valid_temperatures:
        ordinal = (
            date(reference_year, record_date.month, record_date.day)
            - date(reference_year, 1, 1)
        ).days
        per_day[ordinal] += 1

    sample_counts = {}
    indices = np.arange(366)

    for day_number in range(366):
        target = date(reference_year, 1, 1) + timedelta(
            days=day_number
        )
        key = target.strftime("%m-%d")
        if key in seasonal_thresholds:
            distance = np.abs(indices - day_number)
            distance = np.minimum(distance, 366 - distance)
            sample_counts[key] = int(
                per_day[distance <= window_days].sum()
            )

    counts = list(sample_counts.values())

    return {
        "expected_baseline_days": expected_days,
        "unique_baseline_dates": len(unique_dates),
        "missing_dates": expected_days - len(unique_dates),
        "duplicate_records": duplicate_records,
        "missing_temperature_records": missing_temperatures,
        "invalid_temperature_records": invalid_temperatures,
        "records_outside_baseline": outside_baseline,
        "seasonal_threshold_count": len(seasonal_thresholds),
        "minimum_threshold_sample_count": min(counts) if counts else 0,
        "maximum_threshold_sample_count": max(counts) if counts else 0,
        "thresholds_with_fewer_than_100_samples": sum(
            count < 100 for count in counts
        ),
    }
