import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Rectangle, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L, { type LatLngBoundsExpression } from "leaflet";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Crosshair,
  MapPin,
  MousePointer2,
  LoaderCircle,
  RotateCcw,
  Search,
  SquareDashedMousePointer,
} from "lucide-react";
import RegionAutocomplete, { type LocationResult } from "../components/common/RegionAutocomplete";
import { getAreaHeatwaveAnalysis, type AreaHeatwaveResponse } from "../services/climateApi";

type MapPoint = { lat: number; lng: number };
type SelectionMode = "point" | "rectangle";

const DEFAULT_ZOOM = 14;

const markerIcon = L.divIcon({
  className: "climatewatch-map-marker",
  html: '<div style="width:18px;height:18px;background:#C45120;border:3px solid white;border-radius:50%;box-shadow:0 1px 8px #17352f66;"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function MapClickHandler({ mode, onPoint }: { mode: SelectionMode; onPoint: (point: MapPoint) => void }) {
  useMapEvents({
    click(event) {
      if (mode === "point") {
        onPoint({
          lat: event.latlng.lat,
          lng: event.latlng.lng,
        });
      }
    },
  });

  return null;
}

function RectangleDrawHandler({
  enabled,
  onStart,
  onMove,
  onEnd,
}: {
  enabled: boolean;
  onStart: (point: MapPoint) => void;
  onMove: (point: MapPoint) => void;
  onEnd: (point: MapPoint) => void;
}) {
  const map = useMap();
  const callbacks = useRef({ onStart, onMove, onEnd });
  callbacks.current = { onStart, onMove, onEnd };

  useEffect(() => {
    const container = map.getContainer();
    let drawing = false;
    let startPoint: MapPoint | null = null;

    function getPoint(event: PointerEvent): MapPoint {
      const containerPoint = map.mouseEventToContainerPoint(event);
      const latlng = map.containerPointToLatLng(containerPoint);

      return { lat: latlng.lat, lng: latlng.lng };
    }

    function handlePointerDown(event: PointerEvent) {
      if (!enabled || event.button !== 0) return;

      const target = event.target as HTMLElement | null;

      if (target?.closest(".leaflet-control, .leaflet-marker-icon, .leaflet-interactive")) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      drawing = true;
      startPoint = getPoint(event);

      map.dragging.disable();
      container.classList.add("rectangle-drawing");

      callbacks.current.onStart(startPoint);
    }

    function handlePointerMove(event: PointerEvent) {
      if (!drawing) return;

      event.preventDefault();

      const currentPoint = getPoint(event);
      callbacks.current.onMove(currentPoint);
    }

    function handlePointerUp(event: PointerEvent) {
      if (!drawing) return;

      event.preventDefault();

      const endPoint = getPoint(event);

      drawing = false;
      startPoint = null;

      map.dragging.enable();
      container.classList.remove("rectangle-drawing");

      callbacks.current.onEnd(endPoint);
    }

    container.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerup", handlePointerUp, true);
    window.addEventListener("pointercancel", handlePointerUp, true);

    return () => {
      container.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", handlePointerUp, true);
      window.removeEventListener("pointercancel", handlePointerUp, true);

      map.dragging.enable();
      container.classList.remove("rectangle-drawing");
    };
  }, [enabled, map]);

  return null;
}

function MapRecenter({ center, zoom }: { center: MapPoint; zoom?: number }) {
  const map = useMap();

  useEffect(() => {
    map.flyTo([center.lat, center.lng], zoom ?? map.getZoom(), {
      duration: 0.6,
    });
  }, [center.lat, center.lng, zoom, map]);

  return null;
}

function formatCoordinate(value: number) {
  return Number(value).toFixed(5);
}

export default function MapView() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<SelectionMode>("point");
  const [searchText, setSearchText] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<LocationResult | null>(null);
  const [initialCenter, setInitialCenter] = useState<MapPoint | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState("");
  const [point, setPoint] = useState<MapPoint | null>(null);
  const [rectangleStart, setRectangleStart] = useState<MapPoint | null>(null);
  const [rectangleEnd, setRectangleEnd] = useState<MapPoint | null>(null);
  const [latInput, setLatInput] = useState("");
  const [lngInput, setLngInput] = useState("");
  const [coordinateError, setCoordinateError] = useState("");
  const [notice, setNotice] = useState("");
  const [startDate, setStartDate] = useState("2018-01-01");
  const [endDate, setEndDate] = useState("2020-12-31");
  const [areaResult, setAreaResult] = useState<AreaHeatwaveResponse | null>(null);
  const [areaLoading, setAreaLoading] = useState(false);
  const [areaError, setAreaError] = useState("");

  const rectangleBounds = useMemo<LatLngBoundsExpression | null>(() => {
    if (!rectangleStart || !rectangleEnd) return null;
    return [
      [Math.min(rectangleStart.lat, rectangleEnd.lat), Math.min(rectangleStart.lng, rectangleEnd.lng)],
      [Math.max(rectangleStart.lat, rectangleEnd.lat), Math.max(rectangleStart.lng, rectangleEnd.lng)],
    ];
  }, [rectangleStart, rectangleEnd]);

  const mapCenter = point ?? initialCenter;

  function locateCurrentPosition() {
    if (!navigator.geolocation) {
      setLocationLoading(false);
      setLocationError(
        "Your browser does not support location access. Search for a place or enter coordinates to begin.",
      );
      return;
    }

    setLocationLoading(true);
    setLocationError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const current = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setInitialCenter(current);
        setPoint(current);
        setLatInput(formatCoordinate(current.lat));
        setLngInput(formatCoordinate(current.lng));
        setSelectedLocation(null);
        setLocationLoading(false);
        setNotice("Map centered on your current location.");
      },
      (error) => {
        setLocationLoading(false);
        const message =
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied. Search for a place or enter coordinates to open the map."
            : error.code === error.TIMEOUT
              ? "Could not determine your location in time. Search for a place or enter coordinates to continue."
              : "Your current location is unavailable. Search for a place or enter coordinates to continue.";
        setLocationError(message);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }

  useEffect(() => {
    locateCurrentPosition();
  }, []);

  function updatePoint(nextPoint: MapPoint, source = "Map point") {
    setInitialCenter((current) => current ?? nextPoint);
    setPoint(nextPoint);
    setLatInput(formatCoordinate(nextPoint.lat));
    setLngInput(formatCoordinate(nextPoint.lng));
    setSelectedLocation(null);
    setNotice(`${source} selected.`);
    setCoordinateError("");
  }

  function handleLocationSelect(location: LocationResult) {
    const nextPoint = { lat: location.latitude, lng: location.longitude };
    setInitialCenter((current) => current ?? nextPoint);
    setSelectedLocation(location);
    setSearchText([location.name, location.admin1, location.country].filter(Boolean).join(", "));
    setPoint(nextPoint);
    setLatInput(formatCoordinate(nextPoint.lat));
    setLngInput(formatCoordinate(nextPoint.lng));
    setMode("point");
    setRectangleStart(null);
    setRectangleEnd(null);
    setNotice(`Selected ${location.name}.`);
    setCoordinateError("");
  }

  function applyCoordinates() {
    const lat = Number(latInput);
    const lng = Number(lngInput);

    if (
      latInput.trim() === "" ||
      lngInput.trim() === "" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      setCoordinateError("Enter a valid latitude (-90 to 90) and longitude (-180 to 180).");
      return;
    }

    updatePoint({ lat, lng }, "Coordinates");
    setCoordinateError("");
  }

  function clearSelection() {
    setPoint(null);
    setSelectedLocation(null);
    setSearchText("");
    setRectangleStart(null);
    setRectangleEnd(null);
    setAreaResult(null);
    setAreaError("");
    setLatInput("");
    setLngInput("");
    setNotice("");
    setCoordinateError("");
  }

  async function analyzeRectangle() {
    if (!rectangleStart || !rectangleEnd) {
      setAreaError("Draw a rectangle on the map before running area analysis.");
      return;
    }

    if (!startDate || !endDate || startDate > endDate) {
      setAreaError("Choose a valid date range.");
      return;
    }

    const bounds = {
      north: Math.max(rectangleStart.lat, rectangleEnd.lat),
      south: Math.min(rectangleStart.lat, rectangleEnd.lat),
      east: Math.max(rectangleStart.lng, rectangleEnd.lng),
      west: Math.min(rectangleStart.lng, rectangleEnd.lng),
    };

    if (bounds.north - bounds.south < 0.005 || bounds.east - bounds.west < 0.005) {
      setAreaError("Draw a larger rectangle so the area contains useful sampling points.");
      return;
    }

    setAreaLoading(true);
    setAreaError("");
    setAreaResult(null);
    setNotice("Analyzing historical temperatures across the selected area...");

    try {
      const result = await getAreaHeatwaveAnalysis({
        bounds,
        start_date: startDate,
        end_date: endDate,
      });
      setAreaResult(result);
      setNotice("Area analysis completed.");
    } catch (err) {
      setAreaError(err instanceof Error ? err.message : "Unable to analyze the selected area.");
      setNotice("");
    } finally {
      setAreaLoading(false);
    }
  }

  function confirmSelection() {
    if (mode === "point" && !point) {
      setNotice("Choose a point on the map or enter coordinates first.");
      return;
    }
    if (mode === "rectangle" && (!rectangleStart || !rectangleEnd)) {
      setNotice("Draw a rectangle on the map to define your custom area.");
      return;
    }

    if (mode === "point" && point) {
      const location: LocationResult = selectedLocation ?? {
        id: 0,
        name: "Custom map point",
        latitude: point.lat,
        longitude: point.lng,
        country: "",
        admin1: "",
      };
      navigate("/analysis", { state: { mapLocation: location } });
      return;
    }

    void analyzeRectangle();
  }

  return (
    <div className="space-y-6 pb-8">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-[#53756A] hover:text-[#18332F]"
          >
            <ArrowLeft size={16} />
            Back to dashboard
          </button>

          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#B85C24]">Geographic selection</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#18332F] sm:text-3xl">Map View</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#71817A]">
            Select a point for location analysis or draw a rectangle to analyze heatwave patterns across an area.
          </p>
        </div>

        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#DCE5E0] bg-white px-3 py-2 text-xs text-[#71817A]">
          <MapPin size={14} />
          OpenStreetMap · Leaflet
        </span>
      </header>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0 overflow-hidden rounded-2xl border border-[#E1E8E4] bg-white">
          <div className="flex flex-col gap-3 border-b border-[#E6ECE8] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setMode("point");
                  setRectangleStart(null);
                  setRectangleEnd(null);
                  setAreaResult(null);
                  setAreaError("");
                  setNotice("Click the map to select a point.");
                }}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
                  mode === "point"
                    ? "border-[#24534A] bg-[#24534A] text-white"
                    : "border-[#DCE5E0] bg-white text-[#647570]"
                }`}
              >
                <MousePointer2 size={16} />
                Select point
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("rectangle");
                  setRectangleStart(null);
                  setRectangleEnd(null);
                  setAreaResult(null);
                  setAreaError("");
                  setNotice("Drag across the map to define a rectangle.");
                }}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
                  mode === "rectangle"
                    ? "border-[#24534A] bg-[#24534A] text-white"
                    : "border-[#DCE5E0] bg-white text-[#647570]"
                }`}
              >
                <SquareDashedMousePointer size={16} />
                Draw rectangle
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setRectangleStart(null);
                setRectangleEnd(null);
                setAreaResult(null);
                setAreaError("");
                setMode("point");
                setPoint(null);
                setInitialCenter(null);
                setLatInput("");
                setLngInput("");
                locateCurrentPosition();
              }}
              className="inline-flex items-center gap-2 self-start rounded-lg px-3 py-2 text-sm text-[#647570] hover:bg-[#F3F6F4] sm:self-auto"
            >
              <RotateCcw size={15} />
              Reset
            </button>
          </div>

          <div className="relative h-[430px] sm:h-[540px]">
            {mapCenter ? (
              <MapContainer
                key={`${initialCenter?.lat ?? mapCenter.lat}-${initialCenter?.lng ?? mapCenter.lng}`}
                center={[mapCenter.lat, mapCenter.lng]}
                zoom={DEFAULT_ZOOM}
                scrollWheelZoom
                className={`h-full w-full ${mode === "rectangle" ? "cursor-crosshair" : ""}`}
                style={{ background: "#E8EFEB" }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapRecenter center={mapCenter} zoom={DEFAULT_ZOOM} />

                <MapClickHandler mode={mode} onPoint={(nextPoint) => updatePoint(nextPoint)} />

                <RectangleDrawHandler
                  enabled={mode === "rectangle"}
                  onStart={(start) => {
                    setRectangleStart(start);
                    setRectangleEnd(start);
                    setNotice("Drawing rectangle...");
                  }}
                  onMove={(current) => {
                    setRectangleEnd(current);
                  }}
                  onEnd={(end) => {
                    setRectangleEnd(end);
                    setNotice("Custom rectangle selected.");
                  }}
                />

                {point && mode === "point" && (
                  <Marker position={[point.lat, point.lng]} icon={markerIcon} keyboard title="Selected location" />
                )}
                {rectangleBounds && (
                  <Rectangle
                    bounds={rectangleBounds}
                    pathOptions={{
                      color: "#C45120",
                      weight: 2,
                      fillColor: "#F4A261",
                      fillOpacity: 0.18,
                    }}
                  />
                )}
              </MapContainer>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#F5F8F6] px-6 text-center">
                {locationLoading ? (
                  <LoaderCircle size={24} className="animate-spin text-[#C45120]" />
                ) : (
                  <MapPin size={24} className="text-[#C45120]" />
                )}
                <p className="max-w-md text-sm leading-6 text-[#53756A]">
                  {locationLoading
                    ? "Finding your current location…"
                    : locationError || "Search for a location or enter coordinates to open the map."}
                </p>
              </div>
            )}

            {mapCenter && (
              <div className="absolute left-3 top-3 z-[400] flex max-w-[calc(100%-24px)] items-center gap-2 rounded-lg border border-white/70 bg-white/95 px-3 py-2 text-xs font-medium text-[#405850] shadow">
                <Crosshair size={15} className="shrink-0 text-[#C45120]" />
                {mode === "point"
                  ? "Click anywhere on the map to choose a point"
                  : "Drag on the map to set rectangle corners"}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E6ECE8] px-4 py-3 text-xs text-[#82918A]">
            <span>Map tiles © OpenStreetMap contributors</span>
            <span>Point selection opens Analysis · Rectangle selection runs area analysis</span>
          </div>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-[#E1E8E4] bg-white p-5">
            <h2 className="text-base font-semibold text-[#18332F]">Find a location</h2>
            <p className="mt-1 text-xs leading-5 text-[#82918A]">
              Search for a city, then select one of the suggestions.
            </p>
            {locationError && (
              <p role="status" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                {locationError}
              </p>
            )}

            <div className="mt-4">
              <RegionAutocomplete
                value={searchText}
                onChange={(value) => {
                  setSearchText(value);
                  setSelectedLocation(null);
                }}
                onSelect={handleLocationSelect}
                selectedLocation={selectedLocation}
                placeholder="Search city or state..."
              />
            </div>
          </section>

          <section className="rounded-2xl border border-[#E1E8E4] bg-white p-5">
            <h2 className="text-base font-semibold text-[#18332F]">Exact coordinates</h2>
            <p className="mt-1 text-xs leading-5 text-[#82918A]">Enter latitude and longitude directly.</p>

            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs font-semibold text-[#405850]">Latitude</span>
                <input
                  type="number"
                  min="-90"
                  max="90"
                  step="any"
                  value={latInput}
                  onChange={(event) => setLatInput(event.target.value)}
                  placeholder="e.g. 17.385"
                  className="mt-2 w-full rounded-lg border border-[#DCE5E0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#D97745] focus:ring-2 focus:ring-[#D97745]/10"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-[#405850]">Longitude</span>
                <input
                  type="number"
                  min="-180"
                  max="180"
                  step="any"
                  value={lngInput}
                  onChange={(event) => setLngInput(event.target.value)}
                  placeholder="e.g. 78.4867"
                  className="mt-2 w-full rounded-lg border border-[#DCE5E0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#D97745] focus:ring-2 focus:ring-[#D97745]/10"
                />
              </label>

              {coordinateError && (
                <p role="alert" className="text-xs leading-5 text-red-700">
                  {coordinateError}
                </p>
              )}

              <button
                type="button"
                onClick={applyCoordinates}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#DCE5E0] px-4 py-2.5 text-sm font-semibold text-[#24534A] transition hover:bg-[#F3F6F4]"
              >
                <Search size={15} />
                Apply coordinates
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-[#E1E8E4] bg-white p-5">
            <div className="flex items-center gap-2">
              <MapPin size={18} className="text-[#C45120]" />
              <h2 className="text-base font-semibold text-[#18332F]">Current selection</h2>
            </div>

            {mode === "point" ? (
              point ? (
                <div className="mt-3 space-y-2 text-sm">
                  <p className="font-medium text-[#405850]">
                    {selectedLocation
                      ? [selectedLocation.name, selectedLocation.admin1, selectedLocation.country]
                          .filter(Boolean)
                          .join(", ")
                      : "Custom map point"}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-[#F5F8F6] p-3">
                      <p className="text-[10px] uppercase tracking-wide text-[#82918A]">Latitude</p>
                      <p className="mt-1 font-mono text-xs text-[#18332F]">{formatCoordinate(point.lat)}</p>
                    </div>
                    <div className="rounded-lg bg-[#F5F8F6] p-3">
                      <p className="text-[10px] uppercase tracking-wide text-[#82918A]">Longitude</p>
                      <p className="mt-1 font-mono text-xs text-[#18332F]">{formatCoordinate(point.lng)}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-[#82918A]">No point selected.</p>
              )
            ) : rectangleBounds ? (
              <div className="mt-3 space-y-2 text-xs text-[#405850]">
                <p className="font-medium">Custom rectangular area</p>
                <p>South: {Math.min(rectangleStart!.lat, rectangleEnd!.lat).toFixed(5)}</p>
                <p>West: {Math.min(rectangleStart!.lng, rectangleEnd!.lng).toFixed(5)}</p>
                <p>North: {Math.max(rectangleStart!.lat, rectangleEnd!.lat).toFixed(5)}</p>
                <p>East: {Math.max(rectangleStart!.lng, rectangleEnd!.lng).toFixed(5)}</p>
              </div>
            ) : (
              <p className="mt-3 text-sm leading-5 text-[#82918A]">
                No rectangle drawn yet. Choose Draw rectangle and drag on the map.
              </p>
            )}

            {mode === "rectangle" && (
              <div className="mt-4 space-y-3 border-t border-[#E6ECE8] pt-4">
                <h3 className="text-sm font-semibold text-[#405850]">Area analysis period</h3>
                <label className="block">
                  <span className="text-xs text-[#82918A]">Start date</span>
                  <input
                    type="date"
                    value={startDate}
                    max={endDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#DCE5E0] px-3 py-2 text-sm outline-none focus:border-[#D97745]"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-[#82918A]">End date</span>
                  <input
                    type="date"
                    value={endDate}
                    min={startDate}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(event) => setEndDate(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#DCE5E0] px-3 py-2 text-sm outline-none focus:border-[#D97745]"
                  />
                </label>
                {areaError && (
                  <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
                    {areaError}
                  </p>
                )}
              </div>
            )}

            {notice && (
              <p role="status" className="mt-3 rounded-lg bg-[#F5F8F6] px-3 py-2 text-xs leading-5 text-[#53756A]">
                {notice}
              </p>
            )}

            {areaResult && mode === "rectangle" && (
              <section className="mt-4 space-y-3 rounded-xl border border-[#DCE5E0] bg-[#FAFCFB] p-4">
                <h3 className="text-sm font-semibold text-[#18332F]">Area analysis results</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-white p-3">
                    <p className="text-[10px] uppercase tracking-wide text-[#82918A]">Points analyzed</p>
                    <p className="mt-1 text-xl font-bold text-[#18332F]">{areaResult.summary.grid_points_analyzed}</p>
                  </div>
                  <div className="rounded-lg bg-white p-3">
                    <p className="text-[10px] uppercase tracking-wide text-[#82918A]">Heatwave events</p>
                    <p className="mt-1 text-xl font-bold text-[#18332F]">{areaResult.summary.total_events}</p>
                  </div>
                  <div className="rounded-lg bg-white p-3">
                    <p className="text-[10px] uppercase tracking-wide text-[#82918A]">Heatwave days</p>
                    <p className="mt-1 text-xl font-bold text-[#18332F]">{areaResult.summary.total_heatwave_days}</p>
                  </div>
                  <div className="rounded-lg bg-white p-3">
                    <p className="text-[10px] uppercase tracking-wide text-[#82918A]">Period max</p>
                    <p className="mt-1 text-xl font-bold text-[#18332F]">
                      {areaResult.summary.maximum_observed_temperature == null
                        ? "—"
                        : `${areaResult.summary.maximum_observed_temperature.toFixed(1)}°C`}
                    </p>
                  </div>
                </div>
                <p className="text-xs leading-5 text-[#647570]">
                  {areaResult.data_quality.failed_points
                    ? `${areaResult.data_quality.failed_points} sampling point(s) failed. `
                    : ""}
                  Results summarize {areaResult.summary.grid_points_analyzed} analyzed sampling point(s); events are
                  aggregated across points and may represent the same regional episode.
                </p>
                {areaResult.points.length > 0 && (
                  <div className="max-h-48 overflow-auto rounded-lg border border-[#E6ECE8] bg-white">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-[#F3F6F4] text-[#647570]">
                        <tr>
                          <th className="px-3 py-2">Point</th>
                          <th className="px-3 py-2">Events</th>
                          <th className="px-3 py-2">Heatwave days</th>
                        </tr>
                      </thead>
                      <tbody>
                        {areaResult.points.map((item, index) => (
                          <tr key={`${item.latitude}-${item.longitude}`} className="border-t border-[#EDF1EE]">
                            <td className="px-3 py-2">
                              {index + 1} · {item.latitude.toFixed(3)}, {item.longitude.toFixed(3)}
                            </td>
                            <td className="px-3 py-2">{item.summary.event_count}</td>
                            <td className="px-3 py-2">{item.summary.total_heatwave_days}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={confirmSelection}
                disabled={areaLoading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#C45120] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#A94319] disabled:cursor-wait disabled:opacity-60"
              >
                {areaLoading ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />}
                {areaLoading
                  ? "Analyzing area..."
                  : mode === "rectangle"
                    ? "Analyze selected area"
                    : "Confirm selection"}
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-[#647570] transition hover:bg-[#F3F6F4]"
              >
                <RotateCcw size={15} />
                Clear selection
              </button>
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}
