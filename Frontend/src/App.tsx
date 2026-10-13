import { BrowserRouter, Route, Routes } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import Analysis from "./pages/Analysis";
import MapView from "./pages/MapView";
import Export from "./pages/Export";
import Methodology from "./pages/Methodology";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="analysis" element={<Analysis />} />
          <Route path="map" element={<MapView />} />
          <Route path="export" element={<Export />} />
          <Route path="methodology" element={<Methodology />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
