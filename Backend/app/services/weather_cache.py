from datetime import date, timedelta

from app.database import weather_collection
from app.services.weatherservice import fetch_historical_weather

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

        for record in fresh_records:
            document = {
                "latitude": latitude,
                "longitude": longitude,
                "date": record["date"],
                "temperature_max": record["temperature_max"],
            }

            await weather_collection.update_one(
                {
                    "latitude": latitude,
                    "longitude": longitude,
                    "date": record["date"],
                },
                {"$set": document},
                upsert=True,
            )

            records_by_date[record["date"]] = document

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
