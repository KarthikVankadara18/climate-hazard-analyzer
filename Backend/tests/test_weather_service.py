
import httpx
import pytest

from datetime import date
from unittest.mock import AsyncMock, Mock, patch

from app.services.weatherservice import fetch_historical_weather


# Test 1: Invalid latitude should raise ValueError
@pytest.mark.asyncio
async def test_invalid_latitude():
    with pytest.raises(
        ValueError,
        match="Latitude must be between -90 and 90",
    ):
        await fetch_historical_weather(
            latitude=100,
            longitude=-74.0060,
            start_date=date(2023, 1, 1),
            end_date=date(2023, 1, 7),
        )


# Test 2: Invalid longitude should raise ValueError
@pytest.mark.asyncio
async def test_invalid_longitude():
    with pytest.raises(
        ValueError,
        match="Longitude must be between -180 and 180",
    ):
        await fetch_historical_weather(
            latitude=40.7128,
            longitude=-200,
            start_date=date(2023, 1, 1),
            end_date=date(2023, 1, 7),
        )


# Test 3: Valid mocked weather data should have the expected structure
@pytest.mark.asyncio
async def test_weather_data_structure():
    mock_response = {
        "daily": {
            "time": ["2023-01-01", "2023-01-02"],
            "temperature_2m_max": [12.5, 13.2],
        }
    }

    with patch(
        "app.services.weatherservice.httpx.AsyncClient"
    ) as mock_client:
        client = AsyncMock()
        response = Mock()

        response.json.return_value = mock_response
        response.raise_for_status.return_value = None

        client.get.return_value = response
        mock_client.return_value.__aenter__.return_value = client

        weather_data = await fetch_historical_weather(
            latitude=40.7128,
            longitude=-74.0060,
            start_date=date(2023, 1, 1),
            end_date=date(2023, 1, 2),
        )

    assert isinstance(weather_data, list)
    assert len(weather_data) == 2

    assert weather_data[0] == {
        "date": "2023-01-01",
        "temperature_max": 12.5,
    }

    assert weather_data[1] == {
        "date": "2023-01-02",
        "temperature_max": 13.2,
    }

    for entry in weather_data:
        assert "date" in entry
        assert "temperature_max" in entry


# Test 4: Start date after end date should raise ValueError
@pytest.mark.asyncio
async def test_invalid_date_range():
    with pytest.raises(
        ValueError,
        match="Start date must be before or equal to end date",
    ):
        await fetch_historical_weather(
            latitude=40.7128,
            longitude=-74.0060,
            start_date=date(2023, 1, 7),
            end_date=date(2023, 1, 1),
        )


# Test 5: HTTP errors from the external API should propagate
@pytest.mark.asyncio
async def test_weather_api_http_error():
    request = httpx.Request(
        "GET",
        "https://archive-api.open-meteo.com/v1/archive",
    )

    error_response = httpx.Response(
        500,
        request=request,
    )

    http_error = httpx.HTTPStatusError(
        "Server error",
        request=request,
        response=error_response,
    )

    with patch(
        "app.services.weatherservice.httpx.AsyncClient"
    ) as mock_client:
        client = AsyncMock()
        response = Mock()

        response.raise_for_status.side_effect = http_error

        client.get.return_value = response
        mock_client.return_value.__aenter__.return_value = client

        with pytest.raises(httpx.HTTPStatusError):
            await fetch_historical_weather(
                latitude=40.7128,
                longitude=-74.0060,
                start_date=date(2023, 1, 1),
                end_date=date(2023, 1, 7),
            )
