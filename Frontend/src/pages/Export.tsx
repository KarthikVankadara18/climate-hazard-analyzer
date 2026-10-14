import { useState } from "react";
import {
  Download,
  FileSpreadsheet,
  FileText,
  CalendarDays,
  MapPin,
  CheckCircle2,
  Info,
  LoaderCircle,
} from "lucide-react";
import RegionAutocomplete, { type LocationResult } from "../components/common/RegionAutocomplete";
import {
  getHeatwaveAnalysis,
  getHistoricalWeather,
  type AnalysisParams,
  type HeatwaveResponse,
  type HistoricalWeatherResponse,
} from "../services/climateApi";

type ExportFormat = "csv" | "pdf";

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: unknown[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function printReport(report: Window, region: string, analysis: HeatwaveResponse, weather: HistoricalWeatherResponse) {
  const rows = analysis.events
    .map(
      (event) =>
        `<tr><td>${event.start_date}</td><td>${event.end_date}</td><td>${event.duration_days}</td><td>${event.peak_temperature.toFixed(1)} °C</td><td>${event.mean_temperature.toFixed(1)} °C</td><td>${event.mean_threshold.toFixed(1)} °C</td></tr>`,
    )
    .join("");
  const safeRegion = region.replace(/[&<>"]/g, (char) => {
    const escapes: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
    return escapes[char] ?? char;
  });
  report.document.write(
    `<!doctype html><html><head><title>ClimateWatch Report</title><style>body{font:14px Arial,sans-serif;color:#18332f;margin:36px}h1{margin-bottom:6px}p{color:#53665f}section{margin:24px 0}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #dce5e0;padding:8px;text-align:left}th{background:#f3f6f4}.metrics{display:flex;gap:20px;flex-wrap:wrap}.metric{padding:12px;border:1px solid #dce5e0;border-radius:8px;min-width:120px}@media print{button{display:none}}</style></head><body><h1>ClimateWatch Heatwave Analysis</h1><p>${safeRegion} · ${analysis.analysis_period.start_date} to ${analysis.analysis_period.end_date}</p><section class="metrics"><div class="metric"><strong>${analysis.summary.event_count}</strong><br>Detected events</div><div class="metric"><strong>${analysis.summary.total_heatwave_days}</strong><br>Heatwave days</div><div class="metric"><strong>${analysis.data_quality.maximum_observed_temperature.toFixed(1)} °C</strong><br>Period maximum</div><div class="metric"><strong>${weather.count}</strong><br>Weather records</div></section><section><h2>Summary insight</h2><p>${analysis.trends?.insight.text ?? "Not available."}</p></section><section><h2>Methodology</h2><p>${analysis.methodology.threshold_method}; ${analysis.methodology.percentile}th percentile; baseline ${analysis.methodology.baseline_start} to ${analysis.methodology.baseline_end}; ${analysis.methodology.minimum_consecutive_days} consecutive qualifying days required.</p></section><section><h2>Detected events</h2><table><thead><tr><th>Start date</th><th>End date</th><th>Duration</th><th>Peak temp.</th><th>Mean temp.</th><th>Mean threshold</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No heatwave events detected in this period.</td></tr>'}</tbody></table></section><p>Source: ClimateWatch backend historical weather analysis. Use the browser print dialog and choose “Save as PDF”.</p><script>window.onload=()=>window.print()</script></body></html>`,
  );
  report.document.close();
}

export default function Export() {
  const currentYear = new Date().getFullYear();
  const [region, setRegion] = useState("Hyderabad, Telangana, India");
  const [selectedLocation, setSelectedLocation] = useState<LocationResult | null>(null);
  const [startYear, setStartYear] = useState("2018");
  const [endYear, setEndYear] = useState("2020");
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setMessage("");
    setError("");

    const start = Number(startYear);
    const end = Number(endYear);

    if (!selectedLocation) {
      setError("Select a location from the suggestions before exporting.");
      return;
    }
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1940 || end > currentYear || start > end) {
      setError(`Enter a valid year range between 1940 and ${currentYear}.`);
      return;
    }

    const today = new Date();
    const params: AnalysisParams = {
      latitude: selectedLocation.latitude,
      longitude: selectedLocation.longitude,
      start_date: `${start}-01-01`,
      end_date:
        end === today.getFullYear()
          ? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
          : `${end}-12-31`,
    };

    const reportWindow = format === "pdf" ? window.open("", "_blank") : null;
    if (format === "pdf" && !reportWindow) {
      setError("Allow pop-ups for this site to generate the printable PDF report.");
      return;
    }

    setLoading(true);
    try {
      const [analysis, weather] = await Promise.all([getHeatwaveAnalysis(params), getHistoricalWeather(params)]);

      const safeRegion = region
        .trim()
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase();
      if (format === "pdf") {
        printReport(reportWindow!, region, analysis, weather);
        setMessage("Report opened. Choose “Save as PDF” in the print dialog.");
      } else {
        const rows: unknown[][] = [
          ["ClimateWatch Heatwave Analysis"],
          ["Region", region],
          ["Latitude", selectedLocation.latitude],
          ["Longitude", selectedLocation.longitude],
          ["Start date", params.start_date],
          ["End date", params.end_date],
          ["Data source", "ClimateWatch historical weather API"],
          ["Threshold method", analysis.methodology.threshold_method],
          ["Baseline", `${analysis.methodology.baseline_start} to ${analysis.methodology.baseline_end}`],
          ["Percentile", analysis.methodology.percentile],
          ["Calendar-day window", analysis.methodology.calendar_day_window],
          ["Minimum consecutive days", analysis.methodology.minimum_consecutive_days],
          [],
          ["Detected events", analysis.summary.event_count],
          ["Heatwave days", analysis.summary.total_heatwave_days],
          ["Maximum observed temperature (°C)", analysis.data_quality.maximum_observed_temperature],
          ["Weather records returned", weather.count],
          ["Trend insight", analysis.trends?.insight.text ?? "Not available"],
          [],
          [
            "Start date",
            "End date",
            "Duration (days)",
            "Peak temperature (°C)",
            "Mean temperature (°C)",
            "Mean threshold (°C)",
          ],
          ...analysis.events.map((event) => [
            event.start_date,
            event.end_date,
            event.duration_days,
            event.peak_temperature,
            event.mean_temperature,
            event.mean_threshold,
          ]),
        ];
        downloadCsv(`climatewatch-${safeRegion}-${start}-${end}.csv`, rows);
        setMessage(`CSV downloaded with ${analysis.events.length} detected event(s) and analysis metadata.`);
      }
    } catch (err) {
      reportWindow?.close();
      setError(err instanceof Error ? err.message : "Unable to generate the report.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 pb-8">
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#B85C24]">Reports and downloads</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#18332F] sm:text-3xl">Export results</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#71817A]">
          Generate a report from live historical weather and heatwave analysis results.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-2xl border border-[#E1E8E4] bg-white p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FBE8D9]">
              <FileSpreadsheet className="text-[#C45120]" size={21} />
            </div>
            <div>
              <h2 className="font-semibold text-[#18332F]">Export configuration</h2>
              <p className="mt-1 text-xs text-[#82918A]">Choose a location and historical period.</p>
            </div>
          </div>

          <div className="mt-6 space-y-5">
            <div>
              <span className="flex items-center gap-2 text-sm font-semibold text-[#405850]">
                <MapPin size={15} />
                Region
              </span>
              <div className="mt-2">
                <RegionAutocomplete
                  value={region}
                  selectedLocation={selectedLocation}
                  onChange={(value) => {
                    setRegion(value);
                    setSelectedLocation(null);
                    setMessage("");
                    setError("");
                  }}
                  onSelect={(location) => {
                    setSelectedLocation(location);
                    setRegion([location.name, location.admin1, location.country].filter(Boolean).join(", "));
                    setMessage("");
                    setError("");
                  }}
                  placeholder="Search for a city"
                />
              </div>
            </div>

            <div>
              <span className="flex items-center gap-2 text-sm font-semibold text-[#405850]">
                <CalendarDays size={15} />
                Analysis period
              </span>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <label>
                  <span className="text-xs text-[#82918A]">Start year</span>
                  <input
                    type="number"
                    min="1940"
                    max={currentYear}
                    value={startYear}
                    onChange={(event) => setStartYear(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#DCE5E0] px-3 py-3 text-sm outline-none focus:border-[#D97745]"
                  />
                </label>
                <label>
                  <span className="text-xs text-[#82918A]">End year</span>
                  <input
                    type="number"
                    min="1940"
                    max={currentYear}
                    value={endYear}
                    onChange={(event) => setEndYear(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#DCE5E0] px-3 py-3 text-sm outline-none focus:border-[#D97745]"
                  />
                </label>
              </div>
            </div>

            <div>
              <span className="text-sm font-semibold text-[#405850]">File format</span>
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setFormat("csv");
                    setMessage("");
                  }}
                  className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${format === "csv" ? "border-[#24534A] bg-[#F0F6F2]" : "border-[#DCE5E0] hover:bg-[#F7F9F8]"}`}
                >
                  <FileSpreadsheet size={21} className={format === "csv" ? "text-[#24534A]" : "text-[#82918A]"} />
                  <span>
                    <span className="block text-sm font-semibold text-[#18332F]">CSV spreadsheet</span>
                    <span className="mt-1 block text-xs leading-5 text-[#82918A]">
                      Analysis summary, methodology and detected events.
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFormat("pdf");
                    setMessage("");
                  }}
                  className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${format === "pdf" ? "border-[#24534A] bg-[#F0F6F2]" : "border-[#DCE5E0] hover:bg-[#F7F9F8]"}`}
                >
                  <FileText size={21} className={format === "pdf" ? "text-[#24534A]" : "text-[#82918A]"} />
                  <span>
                    <span className="block text-sm font-semibold text-[#18332F]">PDF report</span>
                    <span className="mt-1 block text-xs leading-5 text-[#82918A]">
                      Print-ready report. Save it as PDF from your browser.
                    </span>
                  </span>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleExport}
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#C45120] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#A94319] disabled:cursor-wait disabled:opacity-60"
            >
              {loading ? <LoaderCircle size={17} className="animate-spin" /> : <Download size={17} />}
              {loading ? "Generating report..." : format === "csv" ? "Download CSV" : "Generate PDF"}
            </button>

            {error && (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm leading-5 text-red-700"
              >
                {error}
              </p>
            )}
            {message && (
              <p role="status" className="rounded-lg bg-[#F5F8F6] px-3 py-3 text-sm leading-5 text-[#405850]">
                {message}
              </p>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-[#E1E8E4] bg-white p-5">
            <h2 className="font-semibold text-[#18332F]">Export summary</h2>
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-xs text-[#82918A]">Region</p>
                <p className="mt-1 break-words text-sm font-medium text-[#405850]">{region || "No region entered"}</p>
              </div>
              <div>
                <p className="text-xs text-[#82918A]">Coordinates</p>
                <p className="mt-1 text-sm font-medium text-[#405850]">
                  {selectedLocation
                    ? `${selectedLocation.latitude.toFixed(4)}, ${selectedLocation.longitude.toFixed(4)}`
                    : "Select a city to resolve coordinates"}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#82918A]">Period</p>
                <p className="mt-1 text-sm font-medium text-[#405850]">
                  {startYear || "—"} – {endYear || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#82918A]">Hazard type</p>
                <p className="mt-1 text-sm font-medium text-[#405850]">Heatwave</p>
              </div>
              <div>
                <p className="text-xs text-[#82918A]">Format</p>
                <p className="mt-1 text-sm font-medium uppercase text-[#405850]">{format}</p>
              </div>
            </div>
          </section>
          <section className="rounded-2xl border border-[#E1E8E4] bg-[#F0F6F2] p-5">
            <div className="flex items-start gap-3">
              <Info size={19} className="mt-0.5 shrink-0 text-[#24534A]" />
              <div>
                <h2 className="text-sm font-semibold text-[#18332F]">Data transparency</h2>
                <p className="mt-2 text-xs leading-5 text-[#53756A]">
                  Exports are generated from the live backend response. The report includes the selected period and the
                  heatwave detection methodology.
                </p>
              </div>
            </div>
          </section>
          <div className="flex items-start gap-2 px-1 text-xs leading-5 text-[#82918A]">
            <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
            <p>
              CSV exports include event-level results and methodology metadata. PDF uses your browser’s print-to-PDF
              feature.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
