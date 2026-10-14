import asyncio
from datetime import date, timedelta

from pymongo import UpdateOne
from pymongo.errors import BulkWriteError

from app.database import weather_collection
from app.services.weatherservice import fetch_historical_weather

# Open-Meteo's archive grid is coarser than 0.01 degrees (~1 km), so snapping
# map clicks to 2 decimals returns the same data but lets nearby clicks share
# one cache entry instead of triggering a fresh 30-year download every time.
COORDINATE_DECIMALS = 2

# One fill at a time per location, so concurrent requests for the same point
# (the Analysis page fires two) don't download and upsert the same data twice.
_location_locks: dict[tuple[float, float], asyncio.Lock] = {}


async def fetch_weather_with_cache(
    latitude: float,
    longitude: float,
    start_date: date,
    end_date: date,
):
    if start_date > end_date:
        raise ValueError(
            "Start date must be before or equal to end date."
        )

    latitude = round(latitude, COORDINATE_DECIMALS)
    longitude = round(longitude, COORDINATE_DECIMALS)
    lock = _location_locks.setdefault((latitude, longitude), asyncio.Lock())

    async with lock:
        return await _fetch_weather_locked(
            latitude, longitude, start_date, end_date
        )


async def _fetch_weather_locked(
    latitude: float,
    longitude: float,
    start_date: date,
    end_date: date,
):
    cursor = weather_collection.find(
        {
            "latitude": latitude,
            "longitude": longitude,
            "date": {
                "$gte": start_date.isoformat(),
                "$lte": end_date.isoformat(),
            },
        },
        {"_id": 0},
    )
    cached_records = await cursor.to_list(length=None)

    records_by_date = {
        record["date"]: record
        for record in cached_records
    }

    missing_dates = []
    current_date = start_date

    while current_date <= end_date:
        date_string = current_date.isoformat()

        if date_string not in records_by_date:
            missing_dates.append(current_date)

        current_date += timedelta(days=1)

    missing_ranges = []

    for missing_date in missing_dates:
        if (
            not missing_ranges
            or missing_date
            != missing_ranges[-1][1] + timedelta(days=1)
        ):
            missing_ranges.append([missing_date, missing_date])
        else:
            missing_ranges[-1][1] = missing_date

    for range_start, range_end in missing_ranges:
        fresh_records = await fetch_historical_weather(
            latitude=latitude,
            longitude=longitude,
            start_date=range_start,
            end_date=range_end,
        )

        operations = []

        for record in fresh_records:
            document = {
                "latitude": latitude,
                "longitude": longitude,
                "date": record["date"],
                "temperature_max": record["temperature_max"],
            }

            operations.append(
                UpdateOne(
                    {
                        "latitude": latitude,
                        "longitude": longitude,
                        "date": record["date"],
                    },
                    {"$set": document},
                    upsert=True,
                )
            )

            records_by_date[record["date"]] = document

        # One batched round trip instead of one per day.
        if operations:
            try:
                await weather_collection.bulk_write(
                    operations, ordered=False
                )
            except BulkWriteError as exc:
                # Duplicate-key errors just mean another worker cached the
                # same day first; anything else is a real failure.
                errors = exc.details.get("writeErrors", [])
                if any(e.get("code") != 11000 for e in errors):
                    raise

    results = []
    current_date = start_date

    while current_date <= end_date:
        record = records_by_date.get(current_date.isoformat())

        if record is not None:
            results.append(
                {
                    "date": record["date"],
                    "temperature_max": record["temperature_max"],
                }
            )

        current_date += timedelta(days=1)

    return results
