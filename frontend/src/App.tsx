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
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem("routiq.dark");
      if (saved !== null) return saved === "true";
    } catch {
      /* noop */
    }
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });

  const navigate = useCallback((page: Page) => {
    window.location.hash = `#/${page}`;
  }, []);

  useFatigue(useCallback(() => navigate("emergency"), [navigate]));

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document
      .querySelector<HTMLLinkElement>("#favicon")
      ?.setAttribute("href", dark ? "/routiqinverted.png" : "/routiqlogo.png");
    try {
      localStorage.setItem("routiq.dark", String(dark));
    } catch {
      /* noop */
    }
  }, [dark]);

  const openReportHazard = useCallback(() => {
    window.location.hash = "#/dashboard?report=1";
  }, []);

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--bg)", color: "var(--text)" }}
    >
      <Navbar
        page={route.page}
        onNavigate={navigate}
        onReportHazard={openReportHazard}
        dark={dark}
        onToggleDark={() => setDark((d) => !d)}
        hideBrandPill={route.page === "dashboard"}
      />

      {route.page === "sleep" && (
        <SleepDrive onGoEmergency={() => navigate("emergency")} />
      )}

      {route.page === "emergency" && (
        <Emergency onGoDashboard={() => navigate("dashboard")} />
      )}

      {route.page === "dashboard" && (
        <Dashboard
          onOpenEmergency={() => navigate("emergency")}
          initialReport={route.report}
          dark={dark}
        />
      )}
    </div>
  );
}
