import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

export default function AppLayout() {
  return (
    <div className="flex h-dvh overflow-hidden bg-[#F3F6F4]">
      <div className="hidden h-full shrink-0 md:block">
        <Sidebar />
      </div>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
          <div className="mx-auto min-h-full w-full max-w-[1600px] px-5 py-6 sm:px-8 lg:px-10">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
