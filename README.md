# ClimateWatch — Climate Hazard Trend Analyzer

ClimateWatch is a full-stack application for exploring historical heatwave patterns at a selected coordinate or across a bounded region. It retrieves historical daily maximum temperatures, caches observations, detects heatwave events using a seasonal percentile threshold, and presents summaries, charts, map-based results, and export options.

## Features

- Analyze a point or a geographic area defined by latitude/longitude bounds.
- Select a historical analysis period.
- View heatwave event counts, event durations, temperature summaries, and trends.
- Explore grid-point results on an interactive map.
- Export analysis results to CSV/PDF from the interface.
- Cache daily weather observations in MongoDB to avoid repeatedly requesting data already stored.
- Validate baseline coverage and report incomplete/failed area points.

## Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, Recharts, Leaflet / React-Leaflet.
- **Backend:** Python, FastAPI, Pydantic, HTTPX, NumPy, SlowAPI.
- **Database:** MongoDB, accessed through PyMongo's async API.
- **Weather data:** Open-Meteo Historical Weather API.

## Project layout

```text
Climate Hazard/
├── Backend/
│   ├── app/
│   │   ├── routes/       # Weather and analysis API endpoints
│   │   ├── services/     # Weather retrieval/cache and heatwave logic
│   │   ├── database.py
│   │   └── limiter.py
│   ├── tests/
│   ├── main.py
│   ├── requirements.txt
│   └── .env.example
└── Frontend/
    ├── src/              # React pages, components, and API client
    ├── package.json
    └── .env.example
```

## Heatwave methodology

1. **Reference baseline:** daily maximum temperatures from 1 January 1991 through 31 December 2020.
2. **Seasonal threshold:** for each calendar date, calculate the 95th percentile from valid baseline observations in a circular window of 15 days before through 15 days after that date. The circular window handles dates near the year boundary; a leap-year reference includes 29 February.
3. **Daily exceedance:** a day qualifies when its maximum temperature is strictly greater than that date's threshold.
4. **Heatwave event:** three or more consecutive qualifying days form an event. A non-exceedance, missing/invalid temperature, unavailable threshold, or date gap breaks a run.
5. **Baseline quality:** analysis checks the availability and quality of baseline records and requires at least 90% valid baseline coverage before using a point for analysis. The API reports quality metrics.
6. **Trend line:** the frontend calculates a linear regression over annual summary values for display. The fitted line and R² are descriptive; they do not, by themselves, establish statistical significance or causation.

This is an operational definition chosen for this project, not a universal definition of a heatwave. Results depend on the source data, selected baseline, threshold window, coordinates, and completeness of observations.

## Area analysis and interpretation

Area analysis samples a geographic grid, with a maximum of 25 points and up to four point analyses running concurrently. Each point has its own seasonal threshold calculation. Regional totals currently sum events and heatwave days across analyzed grid points. **The same regional weather episode can therefore be counted at multiple grid points; the summed total is not a count of unique region-wide events.** The response includes the number of requested/analyzed points and whether partial results occurred.

A single coordinate or grid point is not necessarily representative of an entire city or region. Grid spacing is an approximation and does not represent a continuous spatial model. Trend estimates based on short or incomplete time series should be interpreted cautiously.

## Data source and caching

Historical daily maximum temperature data are requested from the [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api). The backend stores observations in MongoDB using coordinates and date as the lookup identity. For a requested date range, it reads cached records, requests missing date ranges from the weather provider, upserts returned observations, and assembles the result.

Check the provider's current terms, attribution requirements, and availability before deploying the application publicly.

## API overview

The backend exposes interactive API documentation at `/docs` when running locally. Main routes include:

- `GET /health` — service health check.
- `GET /api/weather/historical` — historical weather observations.
- `GET /api/analysis/heatwaves` — heatwave analysis for one coordinate.
- `POST /api/analysis/area-heatwaves` — analysis across a bounded grid.

Analysis routes use IP-based rate limits: 20 requests/minute for point analysis and 5 requests/minute for area analysis. A default limiter limit is also configured. Limits may need tuning for a production deployment and can behave differently behind proxies unless client IP forwarding is configured securely.

## Run locally

### Prerequisites

- Python 3.10 or a compatible version.
- Node.js and npm compatible with the installed Vite version.
- A running MongoDB instance or an accessible MongoDB connection string.

### 1. Backend

Open a terminal in `Climate Hazard/Backend` and create a virtual environment.

**Windows (Command Prompt):**

```bat
py -3.10 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Set the MongoDB values in `.env`, then start the API:

```bat
fastapi dev main.py
```

The API should be available at `http://127.0.0.1:8000`; documentation is at `http://127.0.0.1:8000/docs`. If the `fastapi` command is not available, install the FastAPI CLI appropriate for your environment.

### 2. Frontend

Open another terminal in `Climate Hazard/Frontend`:

```bash
npm install
```

Copy `.env.example` to `.env` and set `VITE_API_BASE_URL` to the backend base URL (for local development, `http://127.0.0.1:8000`). Then run:

```bash
npm run dev
```

Vite prints the local frontend URL, usually `http://localhost:5173`. The backend CORS configuration must allow the frontend origin. If using a different port or a deployed frontend, update the allowed origins in `Backend/main.py` before deployment.

### 3. Tests and checks

From `Climate Hazard/Backend`, run:

```bash
pytest
```

From `Climate Hazard/Frontend`, run:

```bash
npm run build
npm run lint
```

These commands are provided for verification; run them in your environment and resolve any environment-specific failures before submitting.

## Configuration and security

- Do not commit `.env` files, database credentials, API keys, or production secrets.
- Keep `.env.example` limited to placeholder values.
- Configure the production frontend origin in the backend CORS allowlist.
- Use a managed/secured MongoDB deployment for production rather than exposing a local database.
- Consider proxy-aware rate limiting, logging, request timeouts, and provider quotas before public deployment.

## AI assistance disclosure

AI tools, including ChatGPT, were used as a development aid during this project. Assistance was focused on understanding and refining parts of the heatwave methodology—particularly the seasonal 95th-percentile threshold calculation and calendar-window handling—along with debugging, reviewing edge cases, and making selected adjustments to API handling, data-quality checks, trend presentation, and documentation. The project was iteratively integrated and tested by the developer, who reviewed the suggestions and is responsible for the final implementation and its limitations. AI assistance was not treated as a substitute for understanding or validating the code.

This disclosure should be edited if it does not accurately describe the assistance used in the final submitted version.

## Limitations

- Results depend on the selected historical baseline and the Open-Meteo data available for each coordinate.
- A percentile threshold is a project-defined statistical rule, not a complete measure of human or ecological heat risk.
- The area grid samples points rather than modeling every location continuously.
- Summed grid-point events are not deduplicated into unique regional events.
- Linear regression and R² are descriptive and do not provide a formal significance test.
- Missing observations can split otherwise adjacent heatwave periods; incomplete data may undercount events.

## License

No license is specified in this repository yet. Add a license file if you intend to permit reuse.
