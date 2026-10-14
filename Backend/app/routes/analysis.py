from datetime import date, timedelta
from math import ceil, isfinite
import asyncio
import logging
from time import perf_counter
import httpx
from fastapi import APIRouter, HTTPException, Query, Request

from pydantic import BaseModel, Field, model_validator
from app.services.weather_cache import fetch_weather_with_cache
from app.services.heatwaveservice import (
    BASELINE_START,
    BASELINE_END,
    calculate_seasonal_thresholds,
    detect_heatwaves,
    check_baseline_quality,
)

from app.limiter import limiter
logger = logging.getLogger(__name__)

router = APIRouter()

MAX_GRID_POINTS = 25
MAX_CONCURRENT_POINTS = 4
GRID_SPACING_DEGREES = 0.1
MIN_VALID_BASELINE_RATIO = 0.90

class AreaBounds(BaseModel):

    north: float = Field(ge=-90, le=90)
    south: float = Field(ge=-90, le=90)
    east: float = Field(ge=-180, le=180)
    west: float = Field(ge=-180, le=180)

    @model_validator(mode="after")
    def validate_bounds(self):
        if self.south >= self.north:
            raise ValueError("South must be less than north.")
        if self.west >= self.east:
            raise ValueError(
                "West must be less than east. "
                "Rectangles crossing the antimeridian are not supported."
            )
        return self
    
class AreaAnalysisRequest(BaseModel):
    bounds: AreaBounds
    start_date: date
    end_date: date
    @model_validator(mode="after")

    def validate_dates(self):

        if self.start_date > self.end_date:
            raise ValueError(
                "Start date must be before or equal to end date."
            )
        if self.end_date > date.today():
            raise ValueError("End date cannot be in the future.")
        return self

def generate_grid(bounds: AreaBounds) -> list[tuple[float, float]]:
    """Generate at most 25 evenly distributed grid points."""
    latitude_span = bounds.north - bounds.south
    longitude_span = bounds.east - bounds.west
    latitude_intervals = max(
        1,
        min(
            4,
            ceil(latitude_span / GRID_SPACING_DEGREES),
        ),
    )

    longitude_intervals = max(
        1,
        min(
            4,
            ceil(longitude_span / GRID_SPACING_DEGREES),
        ),
    )

    latitudes = [
        bounds.south + latitude_span * index / latitude_intervals
        for index in range(latitude_intervals + 1)
    ]

    longitudes = [
        bounds.west+ longitude_span * index / longitude_intervals
        for index in range(longitude_intervals + 1)
    ]

    points = [
        (round(latitude, 6), round(longitude, 6))
        for latitude in latitudes
        for longitude in longitudes
    ]
    return points[:MAX_GRID_POINTS]

async def analyze_area_point(

    latitude: float,
    longitude: float,
    start_date: date,
    end_date: date,

) -> dict:

    """Analyze heatwaves at one grid point, with stage-level timing logs."""
    point_started = perf_counter()
    point_label = f"({latitude:.6f}, {longitude:.6f})"
    logger.info(
        "AREA_POINT_START point=%s period=%s..%s",
        point_label, start_date, end_date,
    )

    stage_started = perf_counter()
    baseline_records = await fetch_weather_with_cache(

        latitude=latitude,
        longitude=longitude,
        start_date=BASELINE_START,
        end_date=BASELINE_END,

    )
    logger.info(
        "AREA_POINT_STAGE point=%s stage=baseline_fetch seconds=%.2f records=%d",
        point_label, perf_counter() - stage_started, len(baseline_records),
    )

    expected_baseline_days = (
        BASELINE_END - BASELINE_START

    ).days + 1

    valid_baseline_records = []
    for record in baseline_records:
        temperature = record.get("temperature_max")
        if temperature is None:
            continue
        try:
            temperature = float(temperature)
        except (TypeError, ValueError):
            continue
        if isfinite(temperature):
            valid_baseline_records.append(record)

    if (
        len(valid_baseline_records)< expected_baseline_days * MIN_VALID_BASELINE_RATIO
    ):
        raise ValueError(
            "Insufficient valid temperature data for the "
            "1991-2020 baseline."
        )
    
    stage_started = perf_counter()
    thresholds = await asyncio.to_thread(
        calculate_seasonal_thresholds,
        baseline_records,
        95,
        15,
    )
    logger.info(
        "AREA_POINT_STAGE point=%s stage=thresholds seconds=%.2f count=%d",
        point_label, perf_counter() - stage_started, len(thresholds),
    )

    stage_started = perf_counter()
    baseline_quality = await asyncio.to_thread(
        check_baseline_quality,
        baseline_records,
        thresholds,
        15,
    )
    logger.info(
        "AREA_POINT_STAGE point=%s stage=baseline_quality seconds=%.2f",
        point_label, perf_counter() - stage_started,
    )

    stage_started = perf_counter()
    analysis_records = await fetch_weather_with_cache(
        latitude=latitude,
        longitude=longitude,
        start_date=start_date,
        end_date=end_date,
    )
    logger.info(
        "AREA_POINT_STAGE point=%s stage=analysis_fetch seconds=%.2f records=%d",
        point_label, perf_counter() - stage_started, len(analysis_records),
    )

    stage_started = perf_counter()
    valid_analysis_temperatures = []

    for record in analysis_records:
        temperature = record.get("temperature_max")
        if temperature is None:
            continue
        try:
            temperature = float(temperature)
        except (TypeError, ValueError):
            continue

        if isfinite(temperature):
            valid_analysis_temperatures.append(temperature)

    events = detect_heatwaves(
        analysis_records,
        threshold=thresholds,
        minimum_duration=3,
    )

    longest_event = max(
        events,
        key=lambda event: event["duration_days"],
        default=None,
    )

    total_heatwave_days = sum(
        event["duration_days"] for event in events
    )

    logger.info(
        "AREA_POINT_DONE point=%s seconds=%.2f events=%d",
        point_label, perf_counter() - point_started, len(events),
    )
    return {

        "latitude": latitude,
        "longitude": longitude,
        "summary": {
            "event_count": len(events),
            "total_heatwave_days": total_heatwave_days,
            "longest_event": longest_event,
        },

        "events": events,
        "data_quality": {
            "baseline_valid_days": len(valid_baseline_records),
            "baseline_expected_days": expected_baseline_days,
            "analysis_records_returned": len(analysis_records),
            "maximum_observed_temperature": (
                max(valid_analysis_temperatures)
                if valid_analysis_temperatures
                else None
            ),

            "baseline_quality": baseline_quality,
        },
    }

@router.get("/heatwaves")
@limiter.limit("20/minute")

async def analyze_heatwaves(

    request: Request,
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    start_date: date = Query(...),
    end_date: date = Query(...),

):

    if start_date > end_date:
        raise HTTPException(
            status_code=400,
            detail="Start date must be before or equal to end date.",
        )

    if end_date > date.today():
        raise HTTPException(
            status_code=400,
            detail="End date cannot be in the future.",
        )

    try:

        baseline_records = await fetch_weather_with_cache(
            latitude=latitude,
            longitude=longitude,
            start_date=BASELINE_START,
            end_date=BASELINE_END,
        )

        expected_days = (BASELINE_END - BASELINE_START).days + 1

        valid_baseline_records = [
            record
            for record in baseline_records
            if record.get("temperature_max") is not None
            and isfinite(float(record["temperature_max"]))
        ]

        if len(valid_baseline_records) < expected_days * 0.90:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Insufficient valid temperature data for the "
                    "1991-2020 baseline. Heatwave analysis was not performed."
                ),
            )

        seasonal_thresholds = await asyncio.to_thread(
            calculate_seasonal_thresholds,
            baseline_records,
            95,
            15,
        )

        baseline_quality = await asyncio.to_thread(
            check_baseline_quality,
            baseline_records,
            seasonal_thresholds,
            15,
        )

        analysis_records = await fetch_weather_with_cache(
            latitude=latitude,
            longitude=longitude,
            start_date=start_date,
            end_date=end_date,
        )

        days_above_threshold = 0

        valid_analysis_temperatures = []

        for record in analysis_records:
            temperature = record.get("temperature_max")
            if temperature is None:
                continue

            temperature = float(temperature)

            if not isfinite(temperature):
                continue

            valid_analysis_temperatures.append(temperature)

            day_key = date.fromisoformat(
                record["date"]
            ).strftime("%m-%d")
            day_threshold = seasonal_thresholds.get(day_key)

            if (
                day_threshold is not None
                and temperature > day_threshold
            ):

                days_above_threshold += 1
                
        maximum_observed_temperature = (

            max(valid_analysis_temperatures)

            if valid_analysis_temperatures

            else None

        )

        events = detect_heatwaves(
            analysis_records,
            threshold=seasonal_thresholds,
            minimum_duration=3,
        )

        event_dates = {

            (

                date.fromisoformat(event["start_date"])

                + timedelta(days=offset)

            ).isoformat()

            for event in events

            for offset in range(event["duration_days"])

        }

        qualifying_dates = set()

        for record in analysis_records:

            temperature = record.get("temperature_max")

            if temperature is None:

                continue

            temperature = float(temperature)

            if not isfinite(temperature):

                continue

            day_key = date.fromisoformat(

                record["date"]

            ).strftime("%m-%d")

            day_threshold = seasonal_thresholds.get(day_key)

            if (

                day_threshold is not None

                and temperature > day_threshold

            ):

                qualifying_dates.add(record["date"])

        unclustered_qualifying_days = (

            qualifying_dates - event_dates

        )

        total_heatwave_days = sum(

            event["duration_days"] for event in events

        )

        longest_event = max(

            events,

            key=lambda event: event["duration_days"],

            default=None,

        )

        return {

            "location": {

                "latitude": latitude,

                "longitude": longitude,

            },

            "analysis_period": {

                "start_date": start_date.isoformat(),

                "end_date": end_date.isoformat(),

            },

            "methodology": {

                "baseline_start": BASELINE_START.isoformat(),

                "baseline_end": BASELINE_END.isoformat(),

                "percentile": 95,

                "threshold_method": "Seasonal 95th percentile",

                "calendar_day_window": 15,

                "minimum_consecutive_days": 3,

                "missing_data_policy": (

                    "Missing temperatures and date gaps break events."

                ),

            },

            "summary": {

                "event_count": len(events),

                "total_heatwave_days": total_heatwave_days,

                "longest_event": longest_event,

            },

            "events": events,

            "data_quality": {

                "baseline_valid_days": len(valid_baseline_records),

                "baseline_expected_days": expected_days,

                "analysis_records_returned": len(analysis_records),

                "days_above_threshold": days_above_threshold,

                "maximum_observed_temperature": (

                    maximum_observed_temperature

                ),

                "baseline_quality": baseline_quality,

                "qualifying_days": len(qualifying_dates),

                "qualifying_days_in_events": len(

                    qualifying_dates & event_dates

                ),

                "qualifying_days_outside_events": len(

                    unclustered_qualifying_days

                ),

                "qualifying_dates_outside_events": sorted(

                    unclustered_qualifying_days

                ),

            },

        }

    except HTTPException:

        raise

    except ValueError as exc:

        raise HTTPException(

            status_code=422,

            detail=str(exc),

        ) from exc

    except httpx.TimeoutException as exc:

        raise HTTPException(

            status_code=504,

            detail="The weather provider timed out.",

        ) from exc

    except httpx.HTTPStatusError as exc:

        raise HTTPException(

            status_code=502,

            detail=(

                "The weather provider returned an unsuccessful response."

            ),

        ) from exc

    except httpx.RequestError as exc:

        raise HTTPException(

            status_code=502,

            detail="Unable to connect to the weather provider.",

        ) from exc

@router.post("/area-heatwaves")

@limiter.limit("5/minute")

async def analyze_area_heatwaves(

    request: Request,

    analysis_request: AreaAnalysisRequest,

):

    area_started = perf_counter()
    bounds = analysis_request.bounds
    grid_points = generate_grid(bounds)
    logger.info(
        "AREA_REQUEST_START start=%s end=%s bounds=%s grid_points=%d concurrency=%d",
        analysis_request.start_date,
        analysis_request.end_date,
        bounds.model_dump(),
        len(grid_points),
        MAX_CONCURRENT_POINTS,
    )
    semaphore = asyncio.Semaphore(MAX_CONCURRENT_POINTS)

    async def analyze_limited(

        latitude: float,

        longitude: float,

    ):

        async with semaphore:
            point_started = perf_counter()
            logger.info(
                "AREA_POINT_QUEUED_START point=(%.6f, %.6f)",
                latitude, longitude,
            )
            try:

                result = await analyze_area_point(

                    latitude=latitude,

                    longitude=longitude,

                    start_date=analysis_request.start_date,

                    end_date=analysis_request.end_date,

                )

                return result, None

            except httpx.TimeoutException:

                return None, "Weather provider timed out."

            except httpx.HTTPStatusError:

                return None, "Weather provider returned an unsuccessful response."

            except httpx.RequestError:

                return None, "Unable to connect to the weather provider."

            except (ValueError, TypeError, KeyError, OverflowError):

                return None, "Invalid or insufficient weather data."

            except Exception as exc:

                logger.exception(
                    "AREA_POINT_TASK_FAILED point=(%.6f, %.6f) type=%s seconds=%.2f",
                    latitude, longitude, type(exc).__name__,
                    perf_counter() - point_started,
                )
                return None, f"{type(exc).__name__}: {exc}"

    gather_started = perf_counter()
    logger.info(
        "AREA_GATHER_START grid_points=%d concurrency=%d",
        len(grid_points), MAX_CONCURRENT_POINTS,
    )
    results = await asyncio.gather(
        *[
            analyze_limited(latitude, longitude)
            for latitude, longitude in grid_points
        ]
    )
    logger.info(
        "AREA_GATHER_DONE seconds=%.2f succeeded=%d failed=%d",
        perf_counter() - gather_started,
        sum(1 for result, error in results if result is not None),
        sum(1 for result, error in results if error is not None),
    )

    points = [

        result

        for result, error in results

        if result is not None

    ]

    failed_points = len(grid_points) - len(points)

    if not points:

        failure_details = [

            error for result, error in results if error

        ]

        print("All area-analysis grid points failed:", failure_details)

        raise HTTPException(

            status_code=503,

            detail={

                "message": (

                    "Area analysis failed at every grid point."

                ),

                "failed_points": len(grid_points),

                "errors": failure_details[:5],

            },

        )

    total_events = sum(

        point["summary"]["event_count"]

        for point in points

    )

    total_heatwave_days = sum(

        point["summary"]["total_heatwave_days"]

        for point in points

    )

    observed_maxima = [

        point["data_quality"]["maximum_observed_temperature"]

        for point in points

        if point["data_quality"]["maximum_observed_temperature"]

        is not None

    ]

    maximum_observed_temperature = (

        max(observed_maxima) if observed_maxima else None

    )

    logger.info(
        "AREA_REQUEST_DONE seconds=%.2f requested=%d analyzed=%d failed=%d",
        perf_counter() - area_started,
        len(grid_points), len(points), failed_points,
    )
    return {

        "bounds": {

            "north": bounds.north,

            "south": bounds.south,

            "east": bounds.east,

            "west": bounds.west,

        },

        "analysis_period": {

            "start_date": analysis_request.start_date.isoformat(),

            "end_date": analysis_request.end_date.isoformat(),

        },

        "methodology": {

            "baseline_start": BASELINE_START.isoformat(),

            "baseline_end": BASELINE_END.isoformat(),

            "percentile": 95,

            "threshold_method": "Seasonal 95th percentile",

            "calendar_day_window": 15,

            "minimum_consecutive_days": 3,

            "missing_data_policy": (

                "Missing temperatures and date gaps break events."

            ),

            "aggregation_method": (

                "Per-grid-point totals are summed. Events occurring at "

                "multiple grid points are counted separately."

            ),

        },

        "summary": {

            "grid_points_requested": len(grid_points),

            "grid_points_analyzed": len(points),

            "total_events": total_events,

            "total_heatwave_days": total_heatwave_days,

            "maximum_observed_temperature": (

                maximum_observed_temperature

            ),

            "average_events_per_point": round(

                total_events / len(points), 2

            ),

        },

        "points": points,

        "data_quality": {

            "failed_points": failed_points,

            "partial_results": failed_points > 0,

            "message": (

                f"{failed_points} grid point(s) could not be analyzed."

                if failed_points

                else "All grid points were analyzed successfully."

            ),

        },

    }