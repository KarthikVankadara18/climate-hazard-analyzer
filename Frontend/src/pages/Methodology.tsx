import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Database,
  FlaskConical,
  Info,
  ShieldCheck,
  Thermometer,
} from "lucide-react";

const sections = [
  {
    number: "01",
    icon: Thermometer,
    title: "Heatwave definition",
    subtitle: "Event identification",
    content:
      "A heatwave is identified when daily maximum temperature exceeds a fixed, region-specific 95th-percentile threshold for at least three consecutive valid days.",
    details: [
      "Each uninterrupted qualifying run is counted as one event.",
      "Event duration is the number of consecutive qualifying days.",
      "A missing or invalid day breaks the sequence unless a documented data-recovery method is applied.",
    ],
  },
  {
    number: "02",
    icon: CalendarDays,
    title: "Reference baseline",
    subtitle: "Threshold consistency",
    content:
      "The temperature threshold should be calculated using a documented historical reference period and kept fixed when comparing years.",
    details: [
      "Record the baseline start and end years.",
      "Use a consistent threshold when comparing historical and recent periods.",
      "Document any changes to the baseline or temperature-processing method.",
    ],
  },
  {
    number: "03",
    icon: Database,
    title: "Data sources",
    subtitle: "Observations and coverage",
    content:
      "ClimateWatch is designed to use historical daily weather data from a documented external climate-data provider.",
    details: [
      "Record the provider, dataset, requested coordinates, and retrieval period.",
      "Distinguish observed measurements from reanalysis or other modeled estimates.",
      "Report data coverage and missing-day counts for each analysis.",
    ],
  },
  {
    number: "04",
    icon: FlaskConical,
    title: "Trend analysis",
    subtitle: "Long-term change",
    content:
      "Annual event frequency, duration, and temperature intensity can be compared over time to investigate changes in heatwave behavior.",
    details: [
      "Show annual values and the period used for comparison.",
      "Report the direction and magnitude of a fitted trend.",
      "Do not describe a trend as statistically significant unless an appropriate statistical test supports that conclusion.",
    ],
  },
];

export default function Methodology() {
  return (
    <div className="space-y-6 pb-8">
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#B85C24]">Scientific documentation</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#18332F] sm:text-3xl">
          Methodology & data quality
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#71817A]">
          Understand how heatwave events are defined, how historical data should be interpreted, and what limitations
          apply to the results.
        </p>
      </header>

      <section className="rounded-2xl border border-[#DCE5E0] bg-white p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FBE8D9]">
            <BookOpen size={21} className="text-[#C45120]" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-[#18332F]">Method overview</h2>
            <p className="mt-2 text-sm leading-6 text-[#647570]">
              The planned workflow retrieves daily maximum temperatures, checks data quality, applies a fixed regional
              threshold, identifies consecutive heatwave days, and summarizes event frequency, duration, intensity, and
              long-term patterns.
            </p>
            <p className="mt-3 text-xs leading-5 text-[#82918A]">
              Implementation status: these are the intended analysis rules. The climate-data API and calculation
              pipeline have not yet been connected.
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {sections.map((section) => {
          const Icon = section.icon;

          return (
            <section key={section.number} className="rounded-2xl border border-[#E1E8E4] bg-white p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F0F6F2]">
                  <Icon size={21} className="text-[#24534A]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#B85C24]">
                    Method {section.number}
                  </p>
                  <h2 className="mt-1 text-base font-semibold text-[#18332F]">{section.title}</h2>
                  <p className="mt-1 text-xs text-[#82918A]">{section.subtitle}</p>
                </div>
              </div>

              <p className="mt-4 text-sm leading-6 text-[#647570]">{section.content}</p>

              <ul className="mt-4 space-y-3">
                {section.details.map((detail) => (
                  <li key={detail} className="flex items-start gap-2 text-xs leading-5 text-[#53756A]">
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[#56816F]" />
                    <span>{detail}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <section className="rounded-2xl border border-[#E1E8E4] bg-white p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <ShieldCheck size={21} className="text-[#24534A]" />
          <h2 className="text-base font-semibold text-[#18332F]">Data quality checks</h2>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            {
              title: "Missing observations",
              description: "Count missing dates and avoid treating gaps as normal-temperature days.",
            },
            {
              title: "Invalid values",
              description: "Validate dates, numeric temperatures, coordinates, and duplicate records.",
            },
            {
              title: "Coverage",
              description: "Report the proportion of expected daily observations that are available.",
            },
            {
              title: "Reproducibility",
              description: "Record the query period, dataset, threshold, and processing assumptions.",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-xl bg-[#F5F8F6] p-4">
              <h3 className="text-sm font-semibold text-[#405850]">{item.title}</h3>
              <p className="mt-2 text-xs leading-5 text-[#71817A]">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[#EED9C8] bg-[#FFF8F2] p-5">
        <div className="flex items-start gap-3">
          <Info size={20} className="mt-0.5 shrink-0 text-[#B85C24]" />
          <div>
            <h2 className="text-sm font-semibold text-[#8D431E]">Interpretation and limitations</h2>
            <p className="mt-2 text-xs leading-5 text-[#8A624B]">
              Results depend on dataset coverage, spatial resolution, baseline selection, and the heatwave definition. A
              selected coordinate is not automatically representative of an entire city or region. Short or incomplete
              time series can also make trend estimates unreliable. The application should disclose these limitations
              alongside calculated results.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
