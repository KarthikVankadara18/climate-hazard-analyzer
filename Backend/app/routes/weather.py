from datetime import date

import httpx
from fastapi import APIRouter, HTTPException, Query

from app.services.weather_cache import fetch_weather_with_cache

router = APIRouter()


@router.get("/historical")
async def get_historical_weather(
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

    try:
        weather_data = await fetch_weather_with_cache(
            latitude=latitude,
            longitude=longitude,
            start_date=start_date,
            end_date=end_date,
        )

        return {
            "location": {
                "latitude": latitude,
                "longitude": longitude,
            },
            "period": {
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
            },
            "count": len(weather_data),
            "unit": "°C",
            "data": weather_data,
        }

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
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
            detail="The weather provider returned an unsuccessful response.",
        ) from exc

    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail="Unable to connect to the weather provider.",
        ) from exc
