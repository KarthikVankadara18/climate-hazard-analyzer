"""Trend statistics for annual heatwave indicators.

Pure-Python/NumPy (no SciPy). Provides:
  * per-year aggregation with data-coverage checks,
  * 3-year rolling mean,
  * OLS linear regression (slope, R^2),
  * Mann-Kendall test (tie-corrected) with Sen's slope,
  * a first-half vs second-half percent change,
  * an honest, plain-language insight sentence.
"""
from datetime import date, timedelta
from math import erfc, isfinite, sqrt

import numpy as np

MIN_YEAR_COVERAGE = 0.90   # a year needs >=90% valid daily temperatures
MIN_YEARS_FOR_TREND = 8    # below this we refuse to claim a trend
SIGNIFICANCE_LEVEL = 0.05


def _is_valid(value) -> bool:
    if value is None:
        return False
    try:
        return isfinite(float(value))
    except (TypeError, ValueError):
        return False


def build_annual_series(
    events: list[dict],
    analysis_records: list[dict],
    start_date: date,
    end_date: date,
) -> list[dict]:
    """One row per calendar year in the period, flagged valid/invalid."""
    valid_days: dict[int, int] = {}
    for record in analysis_records:
        if _is_valid(record.get("temperature_max")):
            year = int(record["date"][:4])
            valid_days[year] = valid_days.get(year, 0) + 1

    events_by_year: dict[int, int] = {}
    days_by_year: dict[int, int] = {}
    longest_by_year: dict[int, int] = {}
    for event in events:
        first = date.fromisoformat(event["start_date"])
        events_by_year[first.year] = events_by_year.get(first.year, 0) + 1
        longest_by_year[first.year] = max(
            longest_by_year.get(first.year, 0), event["duration_days"]
        )
        # Heatwave days are attributed to the year each day falls in.
        for offset in range(event["duration_days"]):
            year = (first + timedelta(days=offset)).year
            days_by_year[year] = days_by_year.get(year, 0) + 1

    rows = []
    for year in range(start_date.year, end_date.year + 1):
        year_start = max(start_date, date(year, 1, 1))
        year_end = min(end_date, date(year, 12, 31))
        expected = (year_end - year_start).days + 1
        coverage = valid_days.get(year, 0) / expected if expected else 0.0
        rows.append(
            {
                "year": year,
                "events": events_by_year.get(year, 0),
                "heatwave_days": days_by_year.get(year, 0),
                "longest_event_days": longest_by_year.get(year, 0),
                "coverage": round(coverage, 3),
                "valid": coverage >= MIN_YEAR_COVERAGE,
                "partial_year": expected < (
                    366 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 365
                ),
            }
        )
    return rows


def rolling_mean(values: list[float], window: int = 3) -> list[float | None]:
    """Trailing rolling mean; None until `window` values are available."""
    out: list[float | None] = []
    for i in range(len(values)):
        if i + 1 < window:
            out.append(None)
        else:
            out.append(round(sum(values[i + 1 - window : i + 1]) / window, 3))
    return out


def linear_regression(years: list[int], values: list[float]) -> dict | None:
    if len(years) < 3:
        return None
    x = np.asarray(years, dtype=float)
    y = np.asarray(values, dtype=float)
    x_mean, y_mean = x.mean(), y.mean()
    denominator = float(((x - x_mean) ** 2).sum())
    if denominator == 0:
        return None
    slope = float(((x - x_mean) * (y - y_mean)).sum() / denominator)
    intercept = float(y_mean - slope * x_mean)
    total = float(((y - y_mean) ** 2).sum())
    residual = float(((y - (intercept + slope * x)) ** 2).sum())
    r_squared = 1.0 if total == 0 else max(0.0, 1 - residual / total)
    return {
        "slope_per_year": round(slope, 4),
        "slope_per_decade": round(slope * 10, 3),
        "intercept": round(intercept, 4),
        "r_squared": round(r_squared, 4),
    }


def mann_kendall(values: list[float]) -> dict | None:
    """Two-sided Mann-Kendall test with tie correction, plus Sen's slope.

    Slope is per time step (here: per year, as years are consecutive valid
    observations - gaps are handled by the caller passing the real years
    to sens_slope separately).
    """
    n = len(values)
    if n < 4:
        return None

    s = 0
    for i in range(n - 1):
        for j in range(i + 1, n):
            diff = values[j] - values[i]
            s += (diff > 0) - (diff < 0)

    _, counts = np.unique(np.asarray(values, dtype=float), return_counts=True)
    tie_term = sum(int(t) * (int(t) - 1) * (2 * int(t) + 5) for t in counts if t > 1)
    variance = (n * (n - 1) * (2 * n + 5) - tie_term) / 18.0

    if variance <= 0:
        z = 0.0
    elif s > 0:
        z = (s - 1) / sqrt(variance)
    elif s < 0:
        z = (s + 1) / sqrt(variance)
    else:
        z = 0.0

    p_value = erfc(abs(z) / sqrt(2))  # two-sided
    tau = s / (n * (n - 1) / 2)
    return {
        "s": int(s),
        "z": round(z, 4),
        "p_value": round(p_value, 4),
        "tau": round(tau, 4),
        "significant": p_value < SIGNIFICANCE_LEVEL,
        "direction": "increasing" if s > 0 else "decreasing" if s < 0 else "none",
    }


def sens_slope(years: list[int], values: list[float]) -> float | None:
    slopes = [
        (values[j] - values[i]) / (years[j] - years[i])
        for i in range(len(values) - 1)
        for j in range(i + 1, len(values))
        if years[j] != years[i]
    ]
    return round(float(np.median(slopes)), 4) if slopes else None


def period_change(years: list[int], values: list[float]) -> dict | None:
    """Mean of the earlier half vs the later half of the valid years."""
    n = len(values)
    if n < 4:
        return None
    half = n // 2
    first, second = values[:half], values[n - half :]
    first_mean = sum(first) / len(first)
    second_mean = sum(second) / len(second)
    percent = None
    if first_mean > 0:
        percent = round((second_mean - first_mean) / first_mean * 100, 1)
    return {
        "first_period": [years[0], years[half - 1]],
        "second_period": [years[n - half], years[-1]],
        "first_mean_per_year": round(first_mean, 2),
        "second_mean_per_year": round(second_mean, 2),
        "percent_change": percent,
    }


def _metric_trend(rows: list[dict], key: str) -> dict:
    valid = [r for r in rows if r["valid"]]
    years = [r["year"] for r in valid]
    values = [float(r[key]) for r in valid]
    return {
        "linear_regression": linear_regression(years, values),
        "mann_kendall": mann_kendall(values),
        "sens_slope_per_year": sens_slope(years, values) if len(values) >= 4 else None,
        "period_change": period_change(years, values),
    }


def build_insight(rows: list[dict], metrics: dict) -> dict:
    valid_years = sum(1 for r in rows if r["valid"])
    total_years = len(rows)
    skipped = total_years - valid_years
    base = f"Based on {valid_years} of {total_years} years with at least {int(MIN_YEAR_COVERAGE * 100)}% valid daily data"
    if skipped:
        base += f" ({skipped} excluded for missing data)"
    base += "."

    if valid_years < MIN_YEARS_FOR_TREND:
        return {
            "level": "insufficient",
            "text": (
                f"Not enough data for a reliable trend: only {valid_years} valid "
                f"year(s); at least {MIN_YEARS_FOR_TREND} are needed. Choose a longer period. "
                + base
            ),
        }

    days = metrics["heatwave_days"]
    mk, change = days["mann_kendall"], days["period_change"]
    if not mk or not change:
        return {"level": "insufficient", "text": "Trend could not be computed. " + base}

    first, second = change["first_period"], change["second_period"]
    first_mean, second_mean = change["first_mean_per_year"], change["second_mean_per_year"]
    pct = change["percent_change"]
    if pct is None:
        change_text = (
            f"Heatwave days averaged {second_mean} per year in {second[0]}–{second[1]} "
            f"versus 0 in {first[0]}–{first[1]}; a percentage change is undefined from a zero baseline."
        )
    else:
        verb = "increased" if pct > 0 else "decreased" if pct < 0 else "did not change"
        amount = f" by {abs(pct):.0f}%" if pct != 0 else ""
        change_text = (
            f"Heatwave days per year {verb}{amount} between {first[0]}–{first[1]} "
            f"({first_mean}/yr) and {second[0]}–{second[1]} ({second_mean}/yr)."
        )

    if mk["significant"]:
        stat_text = (
            f"The Mann-Kendall test shows a statistically significant {mk['direction']} trend "
            f"(p = {mk['p_value']:.3f})."
        )
        level = "significant"
    else:
        stat_text = (
            f"This is not statistically significant (Mann-Kendall p = {mk['p_value']:.3f}); "
            "year-to-year variability is too large to call it a real trend."
        )
        level = "not_significant"
    return {
        "level": level,
        "text": f"{change_text} {stat_text} {base} This describes change at this location only and does not establish causation.",
    }


def compute_trends(
    events: list[dict],
    analysis_records: list[dict],
    start_date: date,
    end_date: date,
) -> dict:
    rows = build_annual_series(events, analysis_records, start_date, end_date)

    valid_rows = [r for r in rows if r["valid"]]
    rolling = rolling_mean([float(r["heatwave_days"]) for r in valid_rows], 3)
    rolling_by_year = {r["year"]: v for r, v in zip(valid_rows, rolling)}
    for row in rows:
        row["heatwave_days_rolling_3yr"] = rolling_by_year.get(row["year"])

    metrics = {
        "events": _metric_trend(rows, "events"),
        "heatwave_days": _metric_trend(rows, "heatwave_days"),
    }
    return {
        "annual": rows,
        "metrics": metrics,
        "insight": build_insight(rows, metrics),
        "parameters": {
            "min_year_coverage": MIN_YEAR_COVERAGE,
            "min_years_for_trend": MIN_YEARS_FOR_TREND,
            "significance_level": SIGNIFICANCE_LEVEL,
            "rolling_window_years": 3,
        },
    }
