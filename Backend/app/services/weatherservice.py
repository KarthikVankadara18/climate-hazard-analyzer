import httpx
from datetime import date

OPEN_METEO_URL = "https://archive-api.open-meteo.com/v1/archive"

async def fetch_historical_weather(
    latitude: float,
    longitude: float,
    start_date: date,
    end_date: date,
):
    
    if not -90 <= latitude <= 90:
        raise ValueError("Latitude must be between -90 and 90.")

    if not -180 <= longitude <= 180:
        raise ValueError("Longitude must be between -180 and 180.")

    if start_date > end_date:
        raise ValueError("Start date must be before or equal to end date.")

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "daily": "temperature_2m_max",
        "timezone": "auto",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(OPEN_METEO_URL, params=params)
        response.raise_for_status()
        data = response.json()

    daily_data = data.get("daily")

    if not daily_data:
        raise ValueError("Weather API returned no daily data.")

    dates = daily_data.get("time", [])
    temperatures = daily_data.get("temperature_2m_max", [])

    if len(dates) != len(temperatures):
        raise ValueError("Weather API returned inconsistent daily data.")

    return [
        {
            "date": day,
            "temperature_max": temperature,
        }
        for day, temperature in zip(dates, temperatures)
    ]

