import React from "react";
import ReactDOM from "react-dom/client";
import { listen } from "@tauri-apps/api/event";
import App from "./App";
import { runUpdateCheck } from "./updater";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Production builds only — DEV builds skip these so `npm run tauri dev`
// doesn't poke GitHub while iterating locally.
if (!import.meta.env.DEV) {
  // Fire-and-forget on launch — never blocks render.
  void runUpdateCheck();

  // Manual trigger from the tray menu's "Check for updates…" item.
  // If an update exists, the installer flow gives visible feedback. If
  // not, the check is silent — the user sees the current version in the
  // tray menu either way, which is the canonical "indicator."
  void listen("tray:check-updates", () => {
    void runUpdateCheck();
  });
}
