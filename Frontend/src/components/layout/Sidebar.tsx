import { NavLink } from "react-router-dom";

import { LayoutDashboard, ChartNoAxesCombined, Map, Download, BookOpen, CloudSun } from "lucide-react";

const navigation = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Analysis", path: "/analysis", icon: ChartNoAxesCombined },
  { label: "Map View", path: "/map", icon: Map },
  { label: "Export", path: "/export", icon: Download },
  { label: "Methodology", path: "/methodology", icon: BookOpen },
];

export default function Sidebar() {
  return (
    <aside className="flex h-dvh w-60 shrink-0 flex-col overflow-hidden bg-[#102A2B] px-3 py-4 text-white">
      {/* Branding */}
      <div className="mb-5 flex shrink-0 items-center gap-3 px-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F4A261] text-[#102A2B]">
          <CloudSun size={23} />
        </div>

        <div className="min-w-0">
          <h1 className="text-lg font-bold tracking-tight">ClimateWatch</h1>
          <p className="text-xs text-[#A9C0BC]">Climate intelligence</p>
        </div>
      </div>

      {/* Navigation label */}
      <p className="mb-2 shrink-0 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#91AAA5]">
        Workspace
      </p>

      {/* Navigation */}
      <nav className="flex shrink-0 flex-col gap-1.5">
        {navigation.map(({ label, path, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                isActive
                  ? "bg-[#244747] font-semibold text-white shadow-sm"
                  : "text-[#C0D0CC] hover:bg-[#1B3939] hover:text-white"
              }`
            }
          >
            <Icon size={18} strokeWidth={1.8} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Bottom information card */}
      <div className="mt-auto shrink-0 rounded-xl border border-[#345151] bg-[#193636] p-3">
        <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-[#294B48] text-[#F4A261]">
          <CloudSun size={18} />
        </div>

        <h2 className="text-sm font-semibold">Climate insights, clearly.</h2>

        <p className="mt-1.5 text-xs leading-5 text-[#B6C9C3]">
          Explore historical weather patterns and understand how climate hazards change over time.
        </p>
      </div>

      {/* Footer */}
      <p className="mt-3 shrink-0 px-1 text-[10px] text-[#91AAA5]">ClimateWatch · Research preview</p>
    </aside>
  );
}
