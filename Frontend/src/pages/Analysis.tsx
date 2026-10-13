import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  ChartNoAxesCombined,
  CheckCircle2,
  CircleHelp,
  Database,
  Download,
  Flame,
  ShieldCheck,
  Thermometer,
  TrendingUp,
} from "lucide-react";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

import {
  getHeatwaveAnalysis,
  getHistoricalWeather,
  type HeatwaveResponse,
  type HistoricalWeatherResponse,
} from "../services/climateApi";

import type { HeatwaveEvent, WeatherRecord } from "../services/climateApi";

import RegionAutocomplete, { type LocationResult } from "../components/common/RegionAutocomplete";

const cardClass = "rounded-2xl border border-[#E1E8E4] bg-white";

const tabs = [
  { id: "frequency", label: "Frequency & Duration", icon: ChartNoAxesCombined },
  { id: "intensity", label: "Intensity & Seasonality", icon: Thermometer },
  { id: "trends", label: "Trend & Comparison", icon: TrendingUp },
  { id: "quality", label: "Data Quality & Methodology", icon: ShieldCheck },
] as const;

type TabId = (typeof tabs)[number]["id"];

function buildAnnualData(events: HeatwaveEvent[], weather: WeatherRecord[], startYear: number, endYear: number) {
  const years = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i);
  return years.map((year) => {
    const yearEvents = events.filter((event) => Number(event.start_date.slice(0, 4)) === year);
    const yearTemperatures = weather
      .filter(
        (record) =>
          Number(record.date.slice(0, 4)) === year &&
          record.temperature_max != null &&
          Number.isFinite(record.temperature_max),
      )
      .map((record) => record.temperature_max as number);
    return {
      year: String(year),
      events: yearEvents.length,
      days: yearEvents.reduce((total, event) => total + event.duration_days, 0),
      temperature: yearTemperatures.length > 0 ? Math.max(...yearTemperatures) : null,
    };
  });
}


type TrendModel = {
  slopePerYear: number;
  slopePerDecade: number;
  intercept: number;
  rSquared: number;
  predict: (year: number) => number;
  sampleSize: number;
};

function fitLinearTrend(
  data: Array<{ year: string; value: number; hasData: boolean }>,
): TrendModel | null {
  const points = data
    .filter((item) => item.hasData && Number.isFinite(item.value))
    .map((item) => ({ year: Number(item.year), value: item.value }))
    .sort((a, b) => a.year - b.year);

  if (points.length < 3) return null;

  const meanYear = points.reduce((sum, point) => sum + point.year, 0) / points.length;
  const meanValue = points.reduce((sum, point) => sum + point.value, 0) / points.length;

  let numerator = 0;
  let denominator = 0;
  for (const point of points) {
    numerator += (point.year - meanYear) * (point.value - meanValue);
    denominator += (point.year - meanYear) ** 2;
  }

  if (denominator === 0) return null;

  const slopePerYear = numerator / denominator;
  const intercept = meanValue - slopePerYear * meanYear;
  const totalSquares = points.reduce((sum, point) => sum + (point.value - meanValue) ** 2, 0);
  const residualSquares = points.reduce(
    (sum, point) => sum + (point.value - (intercept + slopePerYear * point.year)) ** 2,
    0,
  );
  const rSquared =
    totalSquares === 0 ? (residualSquares === 0 ? 1 : 0) : Math.max(0, Math.min(1, 1 - residualSquares / totalSquares));

  return {
    slopePerYear,
    slopePerDecade: slopePerYear * 10,
    intercept,
    rSquared,
    predict: (year: number) => intercept + slopePerYear * year,
    sampleSize: points.length,
  };
}

function formatSlope(value: number | null | undefined, unit: string) {
  if (value == null || !Number.isFinite(value)) return "—";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)} ${unit}`;
}

function buildMonthlyData(events: HeatwaveEvent[], weather: WeatherRecord[]) {
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const heatwaveDays = Array(12).fill(0) as number[];
  const temperatureTotals = Array(12).fill(0) as number[];
  const temperatureCounts = Array(12).fill(0) as number[];
  for (const event of events) {
    const current = new Date(`${event.start_date}T00:00:00Z`);
    const end = new Date(`${event.end_date}T00:00:00Z`);
    while (current <= end) {
      heatwaveDays[current.getUTCMonth()]++;
      current.setUTCDate(current.getUTCDate() + 1);
    }
  }
  for (const record of weather) {
    if (record.temperature_max == null || !Number.isFinite(record.temperature_max)) {
      continue;
    }
    const month = Number(record.date.slice(5, 7)) - 1;
    temperatureTotals[month] += record.temperature_max;
    temperatureCounts[month]++;
  }
  return monthNames.map((month, index) => ({
    month,
    days: heatwaveDays[index],
    avgMax:
      temperatureCounts[index] > 0 ? Number((temperatureTotals[index] / temperatureCounts[index]).toFixed(1)) : null,
  }));
}

function buildDurationData(events: HeatwaveEvent[]) {
  const bands = [
    { duration: "3–4 days", min: 3, max: 4 },
    { duration: "5–6 days", min: 5, max: 6 },
    { duration: "7–9 days", min: 7, max: 9 },
    { duration: "10–14 days", min: 10, max: 14 },
    { duration: "15+ days", min: 15, max: Infinity },
  ];
  return bands.map((band) => ({
    duration: band.duration,
    events: events.filter((event) => event.duration_days >= band.min && event.duration_days <= band.max).length,
  }));
}
function MetricCard({
  title,
  value,
  unit,
  note,
  icon: Icon,
  color,
  direction,
}: {
  title: string;
  value: string;
  unit?: string;
  note: string;
  icon: typeof Flame;
  color: string;
  direction?: "up" | "down";
}) {
  return (
    <div className={`${cardClass} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${color}15`, color }}
        >
          <Icon size={19} />
        </div>
        {direction === "up" && <ArrowUpRight size={16} className="text-[#C45120]" />}
        {direction === "down" && <ArrowDownRight size={16} className="text-[#18866B]" />}
      </div>
      <p className="mt-4 text-xs font-medium text-[#71817A]">{title}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-[#18332F]">
        {value}
        {unit && <span className="ml-1 text-sm font-medium">{unit}</span>}
      </p>
      <p className="mt-1 text-[11px] leading-5 text-[#87948E]">{note}</p>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className={`${cardClass} min-w-0 p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[#18332F]">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-[#82918A]">{subtitle}</p>
        </div>
        <CircleHelp size={16} className="shrink-0 text-[#A1AEA8]" />
      </div>
      <div className="mt-5 h-[260px] w-full">{children}</div>
    </section>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-[#DCE5E0] bg-white px-3 py-2.5 shadow-lg">
      <p className="mb-1.5 text-xs font-semibold text-[#18332F]">{label}</p>
      {payload.map((item) => (
        <p key={item.name} className="text-xs leading-5" style={{ color: item.color }}>
          {item.name}: {item.value}
        </p>
      ))}
    </div>
  );
}

export default function Analysis() {
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const [activeTab, setActiveTab] = useState<TabId>("frequency");
  const [region, setRegion] = useState("Hyderabad");
  const [selectedLocation, setSelectedLocation] = useState<LocationResult | null>(null);
  const [period, setPeriod] = useState("2018–2020");
  const [analysisResult, setAnalysisResult] = useState<HeatwaveResponse | null>(null);
  const [weatherResult, setWeatherResult] = useState<HistoricalWeatherResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const mapLocation = (routeLocation.state as { mapLocation?: LocationResult } | null)?.mapLocation;
    if (!mapLocation) return;
    setSelectedLocation(mapLocation);
    setRegion([mapLocation.name, mapLocation.admin1, mapLocation.country].filter(Boolean).join(", "));
    setAnalysisResult(null);
    setWeatherResult(null);
    setError("");
    setMessage("Map location selected. Run analysis to load its climate data.");
  }, [routeLocation.state]);
  async function handleAnalyze() {
    if (!selectedLocation) {
      setError("Please select a location from the suggestions.");
      return;
    }
    const [startYearText, endYearText] = period.split(/[–-]/);
    const startYear = Number(startYearText);
    const endYear = Number(endYearText);
    if (
      !Number.isInteger(startYear) ||
      !Number.isInteger(endYear) ||
      startYear >= endYear ||
      endYear > new Date().getFullYear()
    ) {
      setError("Please select a valid analysis period.");
      return;
    }
    const today = new Date();
    const endDate =
      endYear === today.getFullYear()
        ? [
            today.getFullYear(),
            String(today.getMonth() + 1).padStart(2, "0"),
            String(today.getDate()).padStart(2, "0"),
          ].join("-")
        : `${endYear}-12-31`;
    const params = {
      latitude: selectedLocation.latitude,
      longitude: selectedLocation.longitude,
      start_date: `${startYear}-01-01`,
      end_date: endDate,
    };
    setLoading(true);
    setError("");
    setMessage("");
    setAnalysisResult(null);
    setWeatherResult(null);
    try {
      const [analysis, weather] = await Promise.all([getHeatwaveAnalysis(params), getHistoricalWeather(params)]);
      setAnalysisResult(analysis);
      setWeatherResult(weather);
      setMessage(`Analysis completed for ${selectedLocation.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to retrieve climate analysis.");
    } finally {
      setLoading(false);
    }
  }
  const [startYear, endYear] = period.split(/[–-]/).map(Number);
  const annualData = useMemo(
    () =>
      analysisResult && weatherResult
        ? buildAnnualData(analysisResult.events, weatherResult.data, startYear, endYear)
        : [],
    [analysisResult, weatherResult, startYear, endYear],
  );
  const monthlyData = useMemo(
    () => (analysisResult && weatherResult ? buildMonthlyData(analysisResult.events, weatherResult.data) : []),
    [analysisResult, weatherResult],
  );
  const frequencyTrend = useMemo(
    () => fitLinearTrend(annualData.map((item) => ({ year: item.year, value: item.events, hasData: item.temperature !== null }))),
    [annualData],
  );
  const heatwaveDaysTrend = useMemo(
    () => fitLinearTrend(annualData.map((item) => ({ year: item.year, value: item.days, hasData: item.temperature !== null }))),
    [annualData],
  );
  const annualTrendData = useMemo(
    () =>
      annualData.map((item) => ({
        ...item,
        fittedEvents: frequencyTrend ? Math.max(0, frequencyTrend.predict(Number(item.year))) : null,
      })),
    [annualData, frequencyTrend],
  );
  const durationData = useMemo(() => buildDurationData(analysisResult?.events ?? []), [analysisResult]);
  const annualTemperatureValues = annualData
    .map((item) => item.temperature)
    .filter((value): value is number => value !== null);
  const temperatureDomain: [number, number] =
    annualTemperatureValues.length > 0
      ? [
          Math.floor(Math.min(...annualTemperatureValues) - 1),
          Math.ceil(Math.max(...annualTemperatureValues) + 1),
        ]
      : [0, 45];
  const averageDuration =
    analysisResult && analysisResult.events.length > 0
      ? analysisResult.summary.total_heatwave_days / analysisResult.events.length
      : null;
  const longestEvent = analysisResult?.summary.longest_event ?? null;
  const peakTemperature =
    typeof analysisResult?.data_quality.maximum_observed_temperature === "number"
      ? analysisResult.data_quality.maximum_observed_temperature
      : null;
  const warmestMonth = useMemo(() => {
    const validMonths = monthlyData.filter((item) => item.avgMax !== null);
    if (validMonths.length === 0) return "—";
    return validMonths.reduce((warmest, item) =>
      (item.avgMax ?? -Infinity) > (warmest.avgMax ?? -Infinity) ? item : warmest,
    ).month;
  }, [monthlyData]);
  const baselineQuality = analysisResult?.data_quality.baseline_quality;
  return (
    <div className="space-y-6 pb-8">
<header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#B85C24]">Climate intelligence</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#18332F] sm:text-3xl">Heatwave Analysis</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#71817A]">
            Explore heatwave frequency, duration, temperature extremes, and historical changes for your selected region.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/export", { state: { location: selectedLocation, region, period } })}
            className="inline-flex items-center gap-2 rounded-lg border border-[#DCE5E0] bg-white px-3 py-2 text-xs font-semibold text-[#405850] transition hover:bg-[#F3F6F4]"
          >
            <Download size={14} />
            Export
          </button>
        </div>
      </header>
      <section className={`${cardClass} flex flex-col gap-4 p-4 sm:p-5`}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-[1.5fr_1fr_auto] xl:items-end">
          <div className="min-w-0">
            <label htmlFor="analysis-region" className="text-xs font-medium text-[#647570]">
              Region
            </label>
            <RegionAutocomplete
              value={region}
              selectedLocation={selectedLocation}
              onChange={(value) => {
                setRegion(value);
                setSelectedLocation(null);
                setAnalysisResult(null);
                setWeatherResult(null);
                setError("");
                setMessage("");
              }}
              onSelect={(location) => {
                setSelectedLocation(location);
                setRegion([location.name, location.admin1, location.country].filter(Boolean).join(", "));
                setAnalysisResult(null);
                setWeatherResult(null);
                setError("");
                setMessage("");
              }}
              placeholder="Search for a city"
            />
          </div>
          <label className="block">
            <span className="text-xs font-medium text-[#647570]">Time period</span>
            <select
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              className="mt-2 w-full rounded-lg border border-[#DCE5E0] bg-white px-3 py-2.5 text-sm text-[#18332F] outline-none focus:border-[#D97745]"
            >
              <option value="2018–2020">2018–2020</option>
              <option value="2015–2020">2015–2020</option>
              <option value="2005–2014">2005–2014</option>
              <option value="1995–2004">1995–2004</option>
            </select>
          </label>
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={loading}
            className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg bg-[#C45120] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#A94319] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Analyzing..." : "Run analysis"}
          </button>
        </div>
        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {message && (
          <div
            role="status"
            className="rounded-lg border border-[#DCE5E0] bg-[#FAFCFB] px-4 py-3 text-sm text-[#24534A]"
          >
            {message}
          </div>
        )}
        {loading && (
          <p className="text-xs text-[#82918A]">Retrieving historical weather and calculating heatwave events...</p>
        )}
      </section>
<div className="overflow-x-auto border-b border-[#DCE5E0]">
        <div className="flex min-w-max gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 border-b-2 px-3 py-3 text-xs font-semibold transition sm:px-4 sm:text-sm ${
                  selected
                    ? "border-[#C45120] text-[#B84B1C]"
                    : "border-transparent text-[#71817A] hover:text-[#18332F]"
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
{activeTab === "frequency" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Detected events"
              value={analysisResult ? String(analysisResult.summary.event_count) : "—"}
              note="Detected events in the selected period"
              icon={Flame}
              color="#D97745"
            />
            <MetricCard
              title="Heatwave days"
              value={analysisResult ? String(analysisResult.summary.total_heatwave_days) : "—"}
              note="Days belonging to detected events"
              icon={CalendarDays}
              color="#367CCB"
            />
            <MetricCard
              title="Average duration"
              value={averageDuration !== null ? averageDuration.toFixed(1) : "—"}
              unit="days"
              note="Average duration of detected events"
              icon={Activity}
              color="#18866B"
            />
            <MetricCard
              title="Longest event"
              value={longestEvent ? String(longestEvent.duration_days) : "—"}
              unit="days"
              note="Longest detected event"
              icon={TrendingUp}
              color="#9867C5"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartCard title="Annual heatwave frequency" subtitle="Detected events per year">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={annualData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#EDF1EE" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#82918A" }} axisLine={false} tickLine={false} />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: "#82918A" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="events" name="Events" fill="#D97745" radius={[5, 5, 0, 0]} maxBarSize={34} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Heatwave days by year" subtitle="Days belonging to detected events">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={annualData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#EDF1EE" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#82918A" }} axisLine={false} tickLine={false} />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: "#82918A" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="days"
                    name="Heatwave days"
                    stroke="#367CCB"
                    fill="#367CCB"
                    fillOpacity={0.13}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
          <ChartCard title="Event duration distribution" subtitle="Detected events grouped by duration">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={durationData} layout="vertical" margin={{ top: 4, right: 20, left: 12, bottom: 0 }}>
                <CartesianGrid stroke="#EDF1EE" strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: "#82918A" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="duration"
                  width={82}
                  tick={{ fontSize: 11, fill: "#647570" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="events" name="Events" fill="#53756A" radius={[0, 5, 5, 0]} maxBarSize={25} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <EventTable events={analysisResult?.events ?? []} hasResults={analysisResult !== null} />
        </div>
      )}
{activeTab === "intensity" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MetricCard
              title="Period maximum"
              value={peakTemperature !== null ? peakTemperature.toFixed(1) : "—"}
              unit="°C"
              note="Highest observed daily maximum temperature"
              icon={Thermometer}
              color="#D94841"
            />
            <MetricCard
              title="Warmest month"
              value={warmestMonth}
              note="Highest mean daily maximum temperature"
              icon={CalendarDays}
              color="#D97745"
            />
            <MetricCard
              title="Threshold method"
              value={"P95"}
              note="Seasonal 95th-percentile baseline"
              icon={ShieldCheck}
              color="#367CCB"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartCard title="Monthly heatwave days" subtitle="Detected heatwave days by calendar month">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#EDF1EE" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#82918A" }} axisLine={false} tickLine={false} />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: "#82918A" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="days" name="Heatwave days" fill="#D97745" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Monthly maximum temperature" subtitle="Mean daily maximum temperature by month">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#EDF1EE" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#82918A" }} axisLine={false} tickLine={false} />
                  <YAxis
                    domain={["dataMin - 2", "dataMax + 2"]}
                    tick={{ fontSize: 10, fill: "#82918A" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="avgMax"
                    name="Average maximum (°C)"
                    stroke="#C45120"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "#C45120" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
          <section className={`${cardClass} p-5`}>
            <h3 className="text-sm font-semibold text-[#18332F]">How intensity is assessed</h3>
            <p className="mt-2 text-sm leading-6 text-[#71817A]">
              Daily maximum temperatures are compared with a seasonal 95th-percentile threshold calculated from the
              1991–2020 reference baseline. A heatwave event requires at least three consecutive qualifying days.
              Missing dates or invalid temperatures break a qualifying run.
            </p>
          </section>
        </div>
      )}
{activeTab === "trends" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MetricCard
              title="Frequency trend"
              value={frequencyTrend ? formatSlope(frequencyTrend.slopePerDecade, "events/decade") : "Insufficient data"}
              note={
                frequencyTrend
                  ? `Linear regression · R² ${frequencyTrend.rSquared.toFixed(2)} · ${frequencyTrend.sampleSize} years`
                  : "At least 3 years with valid weather data are required"
              }
              icon={TrendingUp}
              color="#D97745"
              direction={frequencyTrend ? (frequencyTrend.slopePerYear > 0 ? "up" : frequencyTrend.slopePerYear < 0 ? "down" : undefined) : undefined}
            />
            <MetricCard
              title="Heatwave-day trend"
              value={heatwaveDaysTrend ? formatSlope(heatwaveDaysTrend.slopePerDecade, "days/decade") : "Insufficient data"}
              note={
                heatwaveDaysTrend
                  ? `Linear regression · R² ${heatwaveDaysTrend.rSquared.toFixed(2)} · ${heatwaveDaysTrend.sampleSize} years`
                  : "At least 3 years with valid weather data are required"
              }
              icon={CalendarDays}
              color="#367CCB"
              direction={heatwaveDaysTrend ? (heatwaveDaysTrend.slopePerYear > 0 ? "up" : heatwaveDaysTrend.slopePerYear < 0 ? "down" : undefined) : undefined}
            />
            <MetricCard
              title="Analysis period"
              value={period}
              note="Selected historical period"
              icon={Activity}
              color="#9867C5"
            />
          </div>
          <ChartCard
            title="Annual events and temperature"
            subtitle="Year-by-year event counts and maximum observed temperatures"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={annualTrendData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#EDF1EE" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#82918A" }} axisLine={false} tickLine={false} />
                <YAxis
                  yAxisId="left"
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: "#82918A" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={temperatureDomain}
                  tick={{ fontSize: 10, fill: "#82918A" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="events"
                  name="Events"
                  stroke="#D97745"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
                <Line
                  yAxisId="left"
                  type="linear"
                  dataKey="fittedEvents"
                  name="Linear trend (events)"
                  stroke="#18866B"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  connectNulls
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="temperature"
                  name="Annual peak (°C)"
                  stroke="#367CCB"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <section className={`${cardClass} p-5`}>
              <div className="flex items-center gap-2">
                <TrendingUp size={18} className="text-[#C45120]" />
                <h3 className="text-sm font-semibold text-[#18332F]">Trend interpretation</h3>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#71817A]">
                {frequencyTrend
                  ? `Ordinary least-squares linear regression estimates a ${frequencyTrend.slopePerYear > 0 ? "rising" : frequencyTrend.slopePerYear < 0 ? "falling" : "flat"} frequency of ${formatSlope(frequencyTrend.slopePerYear, "events/year")} (${formatSlope(frequencyTrend.slopePerDecade, "events/decade")}). The model R² is ${frequencyTrend.rSquared.toFixed(2)} across ${frequencyTrend.sampleSize} years with valid weather observations. R² describes fit, not statistical significance. No p-value or confidence interval is calculated.`
                  : "A linear trend needs at least three years with valid weather observations. The available data are insufficient to fit this model."}
              </p>
            </section>
            <section className={`${cardClass} p-5`}>
              <div className="flex items-center gap-2">
                <CalendarDays size={18} className="text-[#367CCB]" />
                <h3 className="text-sm font-semibold text-[#18332F]">Period comparison</h3>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#71817A]">
                The regression uses annual event counts and heatwave-day totals from the selected period. Years with no valid weather observations are excluded. The current-year result may represent a partial year, and this simple linear model does not establish causation or statistical significance.
              </p>
            </section>
          </div>
        </div>
      )}
{activeTab === "quality" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MetricCard
              title="Coverage"
              value={
                baselineQuality
                  ? `${baselineQuality.unique_baseline_dates}/${baselineQuality.expected_baseline_days}`
                  : "—"
              }
              note="Unique baseline dates / expected dates"
              icon={Database}
              color="#367CCB"
            />
            <MetricCard
              title="Missing days"
              value={baselineQuality ? String(baselineQuality.missing_dates) : "—"}
              note="Missing dates in the reference baseline"
              icon={CalendarDays}
              color="#D97745"
            />
            <MetricCard
              title="Validation"
              value={
                baselineQuality
                  ? baselineQuality.missing_dates === 0 &&
                    baselineQuality.duplicate_records === 0 &&
                    baselineQuality.invalid_temperature_records === 0 &&
                    baselineQuality.missing_temperature_records === 0 &&
                    baselineQuality.records_outside_baseline === 0
                    ? "Passed"
                    : "Review"
                  : "—"
              }
              note="Reference-baseline validation checks"
              icon={CheckCircle2}
              color="#18866B"
            />
          </div>
          <section className={`${cardClass} p-5 sm:p-6`}>
            <h3 className="text-base font-semibold text-[#18332F]">Heatwave definition</h3>
            <p className="mt-2 text-sm leading-6 text-[#71817A]">
              A heatwave event is detected when daily maximum temperature exceeds the seasonal 95th-percentile threshold
              for at least three consecutive valid days. Thresholds are calculated from the 1991–2020 baseline using a
              ±15-calendar-day window around each day of the year. Missing dates or invalid temperatures break event
              runs.
            </p>
            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
              {[
                {
                  title: "Fixed reference threshold",
                  description:
                    "Use a documented reference baseline rather than recalculating the threshold independently every year.",
                },
                {
                  title: "Consecutive valid days",
                  description: "A missing or invalid day should not silently count as a qualifying heatwave day.",
                },
                {
                  title: "Coverage reporting",
                  description: "Show missing observations and the fraction of expected data available for each period.",
                },
                {
                  title: "Transparent uncertainty",
                  description: "Report trend methods, limitations and statistical uncertainty alongside conclusions.",
                },
              ].map((item) => (
                <div key={item.title} className="rounded-xl border border-[#E6ECE8] bg-[#FAFCFB] p-4">
                  <h4 className="text-sm font-semibold text-[#405850]">{item.title}</h4>
                  <p className="mt-2 text-xs leading-5 text-[#82918A]">{item.description}</p>
                </div>
              ))}
            </div>
          </section>
          <section className={`${cardClass} p-5`}>
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-[#18866B]" />
              <h3 className="text-sm font-semibold text-[#18332F]">Reference-baseline data quality</h3>
            </div>
            <ul className="mt-3 space-y-2 text-sm text-[#647570]">
              {[
                "Validate date ordering and duplicate dates.",
                "Check missing daily temperature values.",
                "Confirm the selected period and location.",
                "Track the upstream source and retrieval timestamp.",
                "Avoid reporting percentages when the comparison baseline is zero or unavailable.",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[#53756A]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

function EventTable({ events, hasResults }: { events: HeatwaveEvent[]; hasResults: boolean }) {
  return (
    <section className={`${cardClass} overflow-hidden`}>
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h3 className="text-sm font-semibold text-[#18332F]">Heatwave events</h3>
          <p className="mt-1 text-xs text-[#82918A]">Events detected by the seasonal threshold method.</p>
        </div>
        <span className="rounded-full bg-[#F3F6F4] px-3 py-1.5 text-[10px] font-semibold text-[#71817A]">
          {events.length} events
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-left">
          <thead>
            <tr className="border-y border-[#EDF1EE] bg-[#FAFCFB] text-[10px] uppercase tracking-wider text-[#82918A]">
              <th className="px-5 py-3 font-semibold">Start date</th>
              <th className="px-5 py-3 font-semibold">End date</th>
              <th className="px-5 py-3 font-semibold">Duration</th>
              <th className="px-5 py-3 font-semibold">Peak temp.</th>
              <th className="px-5 py-3 font-semibold">Mean threshold</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.start_date} className="border-b border-[#EDF1EE] last:border-b-0 hover:bg-[#FAFCFB]">
                <td className="whitespace-nowrap px-5 py-3.5 text-xs font-medium text-[#405850]">{event.start_date}</td>
                <td className="whitespace-nowrap px-5 py-3.5 text-xs text-[#647570]">{event.end_date}</td>
                <td className="px-5 py-3.5 text-xs text-[#647570]">{event.duration_days} days</td>
                <td className="px-5 py-3.5 text-xs font-semibold text-[#18332F]">
                  {event.peak_temperature.toFixed(1)}°C
                </td>
                <td className="px-5 py-3.5 text-xs text-[#647570]">{event.mean_threshold.toFixed(1)}°C</td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-sm text-[#82918A]">
                  {hasResults
                    ? "No heatwave events were detected in this period."
                    : "Run an analysis to view detected events."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
