const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error("VITE_API_BASE_URL is missing from .env");
}

export interface WeatherRecord {
  date: string;
  temperature_max: number | null;
}

export interface HistoricalWeatherResponse {
  location: {
    latitude: number;
    longitude: number;
  };
  period: {
    start_date: string;
    end_date: string;
  };
  count: number;
  unit: string;
  data: WeatherRecord[];
}

export interface HeatwaveEvent {
  start_date: string;
  end_date: string;
  duration_days: number;
  peak_temperature: number;
  mean_temperature: number;
  mean_threshold: number;
}

export interface BaselineQuality {
  expected_baseline_days: number;
  unique_baseline_dates: number;
  missing_dates: number;
  duplicate_records: number;
  missing_temperature_records: number;
  invalid_temperature_records: number;
  records_outside_baseline: number;
  seasonal_threshold_count: number;
  minimum_threshold_sample_count: number;
  maximum_threshold_sample_count: number;
  thresholds_with_fewer_than_100_samples: number;
}

export interface HeatwaveDataQuality {
  baseline_valid_days: number;
  baseline_expected_days: number;
  analysis_records_returned: number;
  days_above_threshold: number;
  maximum_observed_temperature: number;
  baseline_quality: BaselineQuality;
  qualifying_days: number;
  qualifying_days_in_events: number;
  qualifying_days_outside_events: number;
  qualifying_dates_outside_events: string[];
}

export interface HeatwaveResponse {
  location: {
    latitude: number;
    longitude: number;
  };
  analysis_period: {
    start_date: string;
    end_date: string;
  };
  methodology: {
    baseline_start: string;
    baseline_end: string;
    percentile: number;
    threshold_method: string;
    calendar_day_window: number;
    minimum_consecutive_days: number;
    missing_data_policy: string;
  };
  summary: {
    event_count: number;
    total_heatwave_days: number;
    longest_event: HeatwaveEvent | null;
  };
  events: HeatwaveEvent[];
  data_quality: HeatwaveDataQuality;
}

export interface AnalysisParams {
  latitude: number;
  longitude: number;
  start_date: string;
  end_date: string;
}

async function apiGet<T>(endpoint: string, params: object): Promise<T> {
  const queryParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    queryParams.append(key, String(value));
  });

  let response: Response;

  try {
    const baseUrl = API_BASE_URL.replace(/\/+$/, "");

    response = await fetch(`${baseUrl}${endpoint}?${queryParams.toString()}`);
  } catch {
    throw new Error("Unable to connect to the ClimateWatch backend. Please check that FastAPI is running.");
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;

    try {
      const errorBody = await response.json();

      if (errorBody.detail) {
        message = typeof errorBody.detail === "string" ? errorBody.detail : JSON.stringify(errorBody.detail);
      }
    } catch {
      // Keep the default HTTP error message.
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

export function getHistoricalWeather(params: AnalysisParams): Promise<HistoricalWeatherResponse> {
  return apiGet<HistoricalWeatherResponse>("/api/weather/historical", params);
}

export function getHeatwaveAnalysis(params: AnalysisParams): Promise<HeatwaveResponse> {
  return apiGet<HeatwaveResponse>("/api/analysis/heatwaves", params);
}


export interface AreaBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface AreaAnalysisParams {
  bounds: AreaBounds;
  start_date: string;
  end_date: string;
}

export interface AreaGridPointResult {
  latitude: number;
  longitude: number;
  summary: {
    event_count: number;
    total_heatwave_days: number;
    longest_event: HeatwaveEvent | null;
  };
  events: HeatwaveEvent[];
  data_quality?: {
    baseline_valid_days?: number;
    baseline_expected_days?: number;
    analysis_records_returned?: number;
    maximum_observed_temperature?: number | null;
  };
}

export interface AreaHeatwaveResponse {
  bounds: AreaBounds;
  analysis_period: {
    start_date: string;
    end_date: string;
  };
  methodology: {
    baseline_start: string;
    baseline_end: string;
    percentile: number;
    threshold_method: string;
    calendar_day_window: number;
    minimum_consecutive_days: number;
    missing_data_policy: string;
    aggregation_method?: string;
  };
  summary: {
    grid_points_requested: number;
    grid_points_analyzed: number;
    total_events: number;
    total_heatwave_days: number;
    maximum_observed_temperature: number | null;
    average_events_per_point?: number;
  };
  points: AreaGridPointResult[];
  data_quality: {
    failed_points?: number;
    partial_results?: boolean;
    message?: string;
  };
}

export async function getAreaHeatwaveAnalysis(
  params: AreaAnalysisParams,
): Promise<AreaHeatwaveResponse> {
  const baseUrl = API_BASE_URL.replace(/\/+$/, "");
  let response: Response;

  try {
    response = await fetch(`${baseUrl}/api/analysis/area-heatwaves`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  } catch {
    throw new Error(
      "Unable to connect to the ClimateWatch backend. Please check that FastAPI is running.",
    );
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;

    try {
      const errorBody = await response.json();
      if (errorBody.detail) {
        message =
          typeof errorBody.detail === "string"
            ? errorBody.detail
            : JSON.stringify(errorBody.detail);
      }
    } catch {
      message = `Area analysis failed with status ${response.status}.`;
    }

    throw new Error(message);
  }

  return (await response.json()) as AreaHeatwaveResponse;
}
