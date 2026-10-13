import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  Database,
  Flame,
  MapPin,
  Thermometer,
  TrendingUp,
  ArrowRight,
  ChartNoAxesCombined,
  Info,
  Clock3,
  ShieldCheck,
} from "lucide-react";

import { ResponsiveContainer, BarChart, Bar, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";

import {
  getHeatwaveAnalysis,
  getHistoricalWeather,
  type HeatwaveResponse,
  type HistoricalWeatherResponse,
  type WeatherRecord,
} from "../services/climateApi";

import RegionAutocomplete, { type LocationResult } from "../components/common/RegionAutocomplete";

const inputClass =
  "mt-2 w-full rounded-lg border border-[#DCE5E0] bg-white px-3 py-2.5 text-sm text-[#18332F] outline-none transition focus:border-[#D97745] focus:ring-2 focus:ring-[#D97745]/10";

const cardClass = "rounded-2xl border border-[#E1E8E4] bg-white";

type MetricCardProps = {
  title: string;
  icon: typeof Flame;
  description: string;
  color: string;
  value: string;
};

function MetricCard({ title, icon: Icon, description, color, value }: MetricCardProps) {
  return (
    <div className={`${cardClass} p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{
            backgroundColor: `${color}15`,
            color,
          }}
        >
          <Icon size={21} />
        </div>

        <Info size={16} className="text-[#A1AEA8]" />
      </div>

      <p className="mt-4 text-sm font-medium text-[#647570]">{title}</p>

      <p className="mt-1 text-2xl font-bold tracking-tight text-[#18332F]">{value}</p>

      <p className="mt-1 text-xs leading-5 text-[#87948E]">{description}</p>
    </div>
  );
}

type ChartPanelProps = {
  title: string;
  subtitle: string;
  icon: typeof Activity;
  data: Array<Record<string, string | number>>;
  xKey: "year" | "month";
  dataKey: "events" | "temperature" | "days";
  color: string;
  wide?: boolean;
};

function ChartPanel({ title, subtitle, icon: Icon, data, xKey, dataKey, color, wide = false }: ChartPanelProps) {
  return (
    <section className={`${cardClass} min-w-0 p-5 ${wide ? "lg:col-span-2" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#18332F] sm:text-base">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-[#82918A]">{subtitle}</p>
        </div>

        <CircleHelp size={17} className="shrink-0 text-[#82918A]" aria-label="Chart information" />
      </div>

      {data.length === 0 ? (
        <div className="mt-5 flex min-h-[210px] flex-col items-center justify-center rounded-xl border border-dashed border-[#DCE5E0] bg-[#FAFCFB] px-5 py-8 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#EDF3EF] text-[#53756A]">
            <Icon size={21} />
          </div>

          <p className="mt-3 text-sm font-medium text-[#405850]">
            {dataKey === "events"
              ? "Heatwave frequency will appear here"
              : "Temperature and heatwave data will appear here"}
          </p>

          <p className="mt-1 max-w-xs text-xs leading-5 text-[#87948E]">
            Run an analysis to populate this chart with retrieved data.
          </p>
        </div>
      ) : (
        <div className="mt-5 h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            {dataKey === "temperature" ? (
              <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 4 }}>
                <CartesianGrid stroke="#E6ECE8" strokeDasharray="3 3" />
                <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: "#82918A" }} />
                <YAxis tick={{ fontSize: 11, fill: "#82918A" }} unit="°C" domain={["auto", "auto"]} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey={dataKey}
                  name="Maximum temperature"
                  stroke={color}
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            ) : (
              <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 4 }}>
                <CartesianGrid stroke="#E6ECE8" strokeDasharray="3 3" />
                <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: "#82918A" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#82918A" }} />
                <Tooltip />
                <Bar
                  dataKey={dataKey}
                  name={dataKey === "events" ? "Heatwave events" : "Heatwave days"}
                  fill={color}
                  radius={[5, 5, 0, 0]}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function buildAnnualFrequency(events: HeatwaveResponse["events"], startYear: number, endYear: number) {
  const counts = new Map<number, number>();

  for (let year = startYear; year <= endYear; year++) {
    counts.set(year, 0);
  }

  for (const event of events) {
    const year = Number(event.start_date.slice(0, 4));

    if (counts.has(year)) {
      counts.set(year, (counts.get(year) ?? 0) + 1);
    }
  }

  return Array.from(counts, ([year, events]) => ({
    year: String(year),
    events,
  }));
}

function buildAnnualMaxTemperature(records: WeatherRecord[]) {
  const maxima = new Map<number, number>();

  for (const record of records) {
    if (record.temperature_max == null) continue;

    const temperature = record.temperature_max;
    if (!Number.isFinite(temperature)) continue;

    const year = Number(record.date.slice(0, 4));
    const currentMax = maxima.get(year);

    if (currentMax === undefined || temperature > currentMax) {
      maxima.set(year, temperature);
    }
  }

  return Array.from(maxima, ([year, temperature]) => ({
    year: String(year),
    temperature: Number(temperature.toFixed(1)),
  })).sort((a, b) => Number(a.year) - Number(b.year));
}

function buildMonthlyHeatwaveDays(events: HeatwaveResponse["events"]) {
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const counts = Array(12).fill(0) as number[];

  for (const event of events) {
    const current = new Date(`${event.start_date}T00:00:00Z`);
    const end = new Date(`${event.end_date}T00:00:00Z`);

    while (current <= end) {
      counts[current.getUTCMonth()]++;
      current.setUTCDate(current.getUTCDate() + 1);
    }
  }

  return monthNames.map((month, index) => ({
    month,
    days: counts[index],
  }));
}

function calculateFrequencyTrend(annualData: { year: string; events: number }[]): number | null {
  // Require at least 3 years to estimate a meaningful trend.
  if (annualData.length < 3) {
    return null;
  }

  const points = annualData
    .map((item) => ({
      year: Number(item.year),
      events: item.events,
    }))
    .sort((a, b) => a.year - b.year);

  const meanYear = points.reduce((sum, point) => sum + point.year, 0) / points.length;

  const meanEvents = points.reduce((sum, point) => sum + point.events, 0) / points.length;

  let numerator = 0;
  let denominator = 0;

  for (const point of points) {
    numerator += (point.year - meanYear) * (point.events - meanEvents);

    denominator += (point.year - meanYear) ** 2;
  }

  if (denominator === 0) {
    return null;
  }

  // Convert events per year to events per decade.
  return (numerator / denominator) * 10;
}

export default function Dashboard() {
  const navigate = useNavigate();

  const [regionType, setRegionType] = useState("city");
  const [region, setRegion] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<LocationResult | null>(null);

  const [hazard, setHazard] = useState("heatwave");
  const [startYear, setStartYear] = useState("1990");
  const [endYear, setEndYear] = useState("2020");
  const [message, setMessage] = useState("");

  const [analysisResult, setAnalysisResult] = useState<HeatwaveResponse | null>(null);
  const [weatherResult, setWeatherResult] = useState<HistoricalWeatherResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleAnalyze() {
    if (!selectedLocation) {
      setMessage("Please select a location from the suggestions before continuing.");
      return;
    }

    const start = Number(startYear);
    const end = Number(endYear);
    const currentYear = new Date().getFullYear();

    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1940 || end > currentYear || start >= end) {
      setMessage("Choose a valid year range. The end year must be later than the start year.");
      return;
    }

    const startDate = `${start}-01-01`;

    // Use today's date for the current year so we don't request
    // historical weather for dates that haven't occurred yet.
    const today = new Date();
    const endDate =
      end === currentYear
        ? [
            today.getFullYear(),
            String(today.getMonth() + 1).padStart(2, "0"),
            String(today.getDate()).padStart(2, "0"),
          ].join("-")
        : `${end}-12-31`;

    const params = {
      latitude: selectedLocation.latitude,
      longitude: selectedLocation.longitude,
      start_date: startDate,
      end_date: endDate,
    };

    setLoading(true);
    setMessage("");
    setAnalysisResult(null);
    setWeatherResult(null);

    try {
      const [analysis, weather] = await Promise.all([getHeatwaveAnalysis(params), getHistoricalWeather(params)]);

      setAnalysisResult(analysis);
      setWeatherResult(weather);

      setMessage(
        `Analysis completed for ${selectedLocation.name}. ` +
          `${analysis.summary.event_count} heatwave events detected; ` +
          `${weather.count} daily weather records retrieved.`,
      );

      console.log("ClimateWatch heatwave analysis:", analysis);
      console.log("ClimateWatch historical weather:", weather);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred while analyzing the data.";

      setMessage(`Analysis failed: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }

  const annualFrequencyData = analysisResult
    ? buildAnnualFrequency(
        analysisResult.events,
        Number(analysisResult.analysis_period.start_date.slice(0, 4)),
        Number(analysisResult.analysis_period.end_date.slice(0, 4)),
      )
    : [];

  const frequencyTrend = analysisResult ? calculateFrequencyTrend(annualFrequencyData) : null;

  const annualTemperatureData = weatherResult ? buildAnnualMaxTemperature(weatherResult.data) : [];

  const monthlyHeatwaveData = analysisResult ? buildMonthlyHeatwaveDays(analysisResult.events) : [];

  return (
    <div className="space-y-6 pb-8">
      {/* Page heading */}
      <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#B85C24]">
            Climate hazard trend analyzer
          </p>

          <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#18332F] sm:text-3xl">Heatwave Trend Analyzer</h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#71817A]">
            Investigate historical heatwaves and understand how their frequency, duration, and intensity change over
            time.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-[#71817A]">
          <span className="flex items-center gap-1.5 rounded-full border border-[#DCE5E0] bg-white px-3 py-2">
            <Database size={14} />
            {loading ? "Analysis running" : analysisResult ? "Analysis complete" : "Analysis not yet run"}
          </span>

          <span className="flex items-center gap-1.5 rounded-full border border-[#DCE5E0] bg-white px-3 py-2">
            <Activity size={14} />
            {loading ? "Analysis running" : analysisResult ? "Analysis complete" : "Analysis not yet run"}
          </span>
        </div>
      </header>

      {/* Region and analysis controls */}
      <section className={`${cardClass} p-4 sm:p-5`}>
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[#18332F]">Configure your analysis</h2>

            <p className="mt-1 text-xs text-[#82918A]">Select a region, hazard, and historical period.</p>
          </div>

          <span className="hidden items-center gap-1.5 text-xs text-[#71817A] sm:flex">
            <ShieldCheck size={15} />
            Validated inputs
          </span>
        </div>

        {/* Region type selector */}
        <div className="mb-5 flex flex-wrap gap-2">
          {[
            { label: "City", value: "city" },
            { label: "State", value: "state" },
            { label: "Custom area", value: "custom" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setRegionType(option.value);
                setMessage("");

                if (option.value === "custom") {
                  navigate("/map");
                }
              }}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                regionType === option.value
                  ? "border-[#24534A] bg-[#24534A] text-white"
                  : "border-[#DCE5E0] bg-white text-[#647570] hover:bg-[#F4F7F5]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-[1.5fr_1fr_0.8fr_0.8fr_auto] xl:items-end">
          {/* Region autocomplete */}
          <div className="block min-w-0">
            <label htmlFor="region-search" className="text-xs font-semibold text-[#405850]">
              Region
            </label>

            <RegionAutocomplete
              value={region}
              selectedLocation={selectedLocation}
              onChange={(value) => {
                setRegion(value);
                setSelectedLocation(null);
                setMessage("");
              }}
              onSelect={(location) => {
                setSelectedLocation(location);

                setRegion([location.name, location.admin1, location.country].filter(Boolean).join(", "));

                setRegionType("city");
                setMessage("");
              }}
              placeholder={regionType === "city" ? "Search for a city" : "Search for a state or region"}
            />
          </div>

          {/* Hazard */}
          <label className="block min-w-0">
            <span className="text-xs font-semibold text-[#405850]">Hazard type</span>

            <div className="relative">
              <Flame size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#D97745]" />

              <select
                className={`${inputClass} appearance-none pl-9 pr-9`}
                value={hazard}
                onChange={(event) => setHazard(event.target.value)}
              >
                <option value="heatwave">Heatwave (default)</option>
                <option value="drought" disabled>
                  Drought (planned)
                </option>
                <option value="heavy-rainfall" disabled>
                  Heavy rainfall (planned)
                </option>
              </select>

              <ChevronDown
                size={15}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#82918A]"
              />
            </div>
          </label>

          {/* Start year */}
          <label className="block min-w-0">
            <span className="text-xs font-semibold text-[#405850]">Start year</span>

            <div className="relative">
              <CalendarDays size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#82918A]" />

              <input
                type="number"
                min="1940"
                max={new Date().getFullYear() - 1}
                className={`${inputClass} pl-9`}
                value={startYear}
                onChange={(event) => setStartYear(event.target.value)}
              />
            </div>
          </label>

          {/* End year */}
          <label className="block min-w-0">
            <span className="text-xs font-semibold text-[#405850]">End year</span>

            <input
              type="number"
              min="1941"
              max={new Date().getFullYear()}
              className={inputClass}
              value={endYear}
              onChange={(event) => setEndYear(event.target.value)}
            />
          </label>

          <button
            type="button"
            onClick={() => {
              console.log("Analyze button clicked");
              handleAnalyze();
            }}
            disabled={loading}
            className="flex min-h-[42px] items-center justify-center gap-2 rounded-lg bg-[#C45120] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#A94319] focus:outline-none focus:ring-2 focus:ring-[#C45120]/30 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 xl:min-w-[125px]"
          >
            {loading ? "Analyzing..." : "Analyze"}
            {!loading && <ArrowRight size={16} />}
          </button>
        </div>

        {message && (
          <div
            role="status"
            className="mt-4 rounded-lg border border-[#E8D6B9] bg-[#FFF8EC] px-4 py-3 text-sm leading-5 text-[#815322]"
          >
            {message}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[#EDF1EE] pt-4 text-xs text-[#82918A]">
          <span className="flex items-center gap-1.5">
            <Flame size={14} className="text-[#D97745]" />
            Rule: 95th percentile · 3+ consecutive days
          </span>

          <span className="flex items-center gap-1.5">
            <MapPin size={14} />
            {regionType === "custom"
              ? "Custom coordinates"
              : regionType === "state"
                ? "State-level selection"
                : "City-level selection"}
          </span>

          <span className="flex items-center gap-1.5">
            <Clock3 size={14} />
            Data retrieval not connected
          </span>
        </div>
      </section>

      <section>
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-[#405850]">At a glance</h2>

          <p className="mt-1 text-xs text-[#82918A]">Metrics will populate after the first successful analysis.</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Heatwave events"
            icon={Flame}
            color="#D97745"
            description="Detected events in the selected period"
            value={analysisResult ? String(analysisResult.summary.event_count) : "—"}
          />

          <MetricCard
            title="Average duration"
            icon={CalendarDays}
            color="#367CCB"
            description="Days per detected event"
            value={
              analysisResult && analysisResult.summary.event_count > 0
                ? `${(analysisResult.summary.total_heatwave_days / analysisResult.summary.event_count).toFixed(1)} days`
                : analysisResult
                  ? "0 days"
                  : "—"
            }
          />

          <MetricCard
            title="Peak temperature"
            icon={Thermometer}
            color="#D94841"
            description="Highest valid daily maximum · °C"
            value={
              typeof analysisResult?.data_quality?.maximum_observed_temperature === "number"
                ? `${analysisResult.data_quality.maximum_observed_temperature.toFixed(1)}°C`
                : "—"
            }
          />

          <MetricCard
            title="Frequency trend"
            icon={TrendingUp}
            color="#18866B"
            description="Linear trend in detected events per decade"
            value={
              frequencyTrend === null ? "—" : `${frequencyTrend > 0 ? "+" : ""}${frequencyTrend.toFixed(1)} / decade`
            }
          />
        </div>
      </section>

      {/* Main analysis charts */}
      <section>
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-[#405850]">Explore climate patterns</h2>

          <p className="mt-1 text-xs text-[#82918A]">Frequency, temperature, seasonality and geographic coverage.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartPanel
            title="Annual heatwave frequency"
            subtitle="Number of separate events detected each year"
            icon={ChartNoAxesCombined}
            data={annualFrequencyData}
            xKey="year"
            dataKey="events"
            color="#D97745"
          />

          <ChartPanel
            title="Annual maximum temperature"
            subtitle="Highest recorded daily maximum for each year"
            icon={Thermometer}
            data={annualTemperatureData}
            xKey="year"
            dataKey="temperature"
            color="#D94841"
          />

          <ChartPanel
            title="Monthly heatwave pattern"
            subtitle="Days belonging to detected heatwave events by month"
            icon={Activity}
            data={monthlyHeatwaveData}
            xKey="month"
            dataKey="days"
            color="#18866B"
          />

          {/* Selected region */}
          <section className={`${cardClass} min-w-0 p-5`}>
            <h2 className="text-sm font-semibold text-[#18332F]">Selected region</h2>

            <p className="mt-1 text-xs leading-5 text-[#82918A]">The geographic area used for the analysis.</p>

            <div className="mt-5 flex min-h-[210px] flex-col items-center justify-center rounded-xl border border-dashed border-[#DCE5E0] bg-[#FAFCFB] p-6 text-center">
              <MapPin size={28} className="text-[#53756A]" />

              <p className="mt-3 text-sm font-medium text-[#405850]">
                {selectedLocation ? selectedLocation.name : "Region map"}
              </p>

              <p className="mt-1 max-w-xs text-xs leading-5 text-[#87948E]">
                {selectedLocation
                  ? `${selectedLocation.latitude.toFixed(3)}, ${selectedLocation.longitude.toFixed(3)}${
                      selectedLocation.country ? ` · ${selectedLocation.country}` : ""
                    }`
                  : "Map tiles, selected coordinates, and the analysis boundary will appear here."}
              </p>

              <button
                type="button"
                onClick={() => navigate("/map")}
                className="mt-4 flex items-center gap-2 text-sm font-semibold text-[#24534A] hover:underline"
              >
                Open Map View
                <ArrowRight size={15} />
              </button>
            </div>
          </section>
        </div>
      </section>

      {/* Insights */}
      <section className={`${cardClass} p-5 sm:p-6`}>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0E5] text-[#C45120]">
            <Activity size={20} />
          </div>

          <div>
            <h2 className="text-base font-semibold text-[#18332F]">Key insights</h2>

            <p className="mt-1 text-sm leading-6 text-[#71817A]">
              Findings will be generated from the observed data, with the comparison period, coverage and statistical
              method shown alongside each conclusion.
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            {
              title: "Frequency change",
              description: "Compare annual event counts across explicitly defined periods.",
            },
            {
              title: "Duration change",
              description: "Investigate whether detected events are becoming longer.",
            },
            {
              title: "Evidence and limitations",
              description: "Review missing-data coverage, trend estimates and uncertainty.",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-xl border border-[#E6ECE8] bg-[#FAFCFB] p-4">
              <h3 className="text-sm font-semibold text-[#405850]">{item.title}</h3>

              <p className="mt-2 text-xs leading-5 text-[#82918A]">{item.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
