import { useCallback, useEffect, useState } from "react";
import { Navbar, type Page } from "./components/Navbar";
import { Dashboard } from "./pages/Dashboard";
import { Emergency } from "./pages/Emergency";
import { SleepDrive } from "./pages/SleepDrive";
import { useFatigue } from "./hooks/useFatigue";

function parseHash(): { page: Page; report: boolean } {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [path, query] = raw.split("?");
  const page: Page = ["dashboard", "sleep", "emergency"].includes(path)
    ? (path as Page)
    : "dashboard";
  return { page, report: query?.includes("report=1") ?? false };
}

export default function App() {
  const [route, setRoute] = useState(() => parseHash());
  const navigate = useCallback((page: Page) => {
    window.location.hash = `#/${page}`;
  }, []);
  const fatigue = useFatigue(
    useCallback(() => navigate("emergency"), [navigate]),
  );
  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const openReportHazard = useCallback(() => {
    window.location.hash = "#/dashboard?report=1";
  }, []);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <Navbar
        page={route.page}
        onNavigate={navigate}
        onReportHazard={openReportHazard}
      />

      {route.page === "sleep" && (
        <SleepDrive
          fatigue={fatigue}
          onGoEmergency={() => navigate("emergency")}
        />
      )}

      {route.page === "emergency" && (
        <Emergency onGoDashboard={() => navigate("dashboard")} />
      )}

      {route.page === "dashboard" && (
        <Dashboard
          onOpenEmergency={() => navigate("emergency")}
          initialReport={route.report}
          fatigue={fatigue}
        />
      )}
    </div>
  );
}
