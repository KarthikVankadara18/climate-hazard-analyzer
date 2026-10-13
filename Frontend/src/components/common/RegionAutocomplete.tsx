import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, MapPin, Search } from "lucide-react";

export type LocationResult = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  country_code?: string;
  admin1?: string;
  feature_code?: string;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSelect: (location: LocationResult) => void;
  selectedLocation: LocationResult | null;
  placeholder?: string;
};

export default function RegionAutocomplete({
  value,
  onChange,
  onSelect,
  selectedLocation,
  placeholder = "Search city or state...",
}: Props) {
  const [results, setResults] = useState<LocationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = value.trim();

    if (query.length < 2 || (selectedLocation && query.toLowerCase().startsWith(selectedLocation.name.toLowerCase()))) {
      setResults([]);
      setLoading(false);
      setError("");
      return;
    }

    const controller = new AbortController();

    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams({
          name: query,
          count: "8",
          language: "en",
          format: "json",
        });

        const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Location search is temporarily unavailable.");
        }

        const data = await response.json();

        if (!controller.signal.aborted) {
          setResults(data.results ?? []);
          setActiveIndex(-1);
          setOpen(true);
        }
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          setError(err.message || "Unable to search locations.");
          setResults([]);
          setOpen(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value, selectedLocation?.name]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  function chooseLocation(location: LocationResult) {
    onSelect(location);
    setOpen(false);
    setResults([]);
    setError("");
    setActiveIndex(-1);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (!results.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (index + 1) % results.length);
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? results.length - 1 : index - 1));
    }

    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      chooseLocation(results[activeIndex]);
    }
  }

  return (
    <div ref={containerRef} className="relative min-w-0">
      <div className="relative">
        <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#82918A]" />

        <input
          type="text"
          role="combobox"
          aria-label="Search for a city or state"
          aria-expanded={open && results.length > 0}
          aria-autocomplete="list"
          autoComplete="off"
          className="w-full rounded-lg border border-[#DCE5E0] bg-white py-2.5 pl-9 pr-10 text-sm text-[#18332F] outline-none transition placeholder:text-[#A1AEA8] focus:border-[#D97745] focus:ring-2 focus:ring-[#D97745]/10"
          placeholder={placeholder}
          value={value}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
        />

        {loading ? (
          <LoaderCircle size={17} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[#82918A]" />
        ) : selectedLocation && value === selectedLocation.name ? (
          <Check size={17} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#18866B]" />
        ) : null}
      </div>

      {open && value.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-[#DCE5E0] bg-white shadow-xl">
          {loading && results.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-4 text-sm text-[#71817A]">
              <LoaderCircle size={16} className="animate-spin" />
              Searching locations...
            </div>
          ) : error ? (
            <p role="alert" className="px-4 py-4 text-sm text-red-700">
              {error}
            </p>
          ) : results.length > 0 ? (
            <>
              <p className="border-b border-[#EDF1EE] px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#82918A]">
                Suggested locations
              </p>

              <ul role="listbox" className="max-h-64 overflow-y-auto overscroll-contain py-1">
                {results.map((location, index) => {
                  const details = [location.admin1, location.country].filter(Boolean);

                  return (
                    <li key={location.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={activeIndex === index}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => chooseLocation(location)}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition ${
                          activeIndex === index ? "bg-[#EDF4F0]" : "hover:bg-[#F5F8F6]"
                        }`}
                      >
                        <MapPin size={17} className="mt-0.5 shrink-0 text-[#C45120]" />

                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-[#18332F]">{location.name}</span>

                          <span className="mt-1 block truncate text-xs text-[#82918A]">
                            {details.join(", ") || "Location"}
                          </span>
                        </span>

                        <span className="shrink-0 text-[10px] text-[#82918A]">
                          {location.latitude.toFixed(2)}, {location.longitude.toFixed(2)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <p className="border-t border-[#EDF1EE] px-3 py-2 text-[10px] text-[#82918A]">
                Location data provided by Open-Meteo · GeoNames
              </p>
            </>
          ) : (
            <p className="px-4 py-4 text-sm text-[#71817A]">
              No matching locations found. Try a city name or add its country.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
