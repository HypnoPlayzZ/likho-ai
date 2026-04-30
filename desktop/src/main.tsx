import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { runUpdateCheck } from "./updater";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Fire-and-forget on launch — never blocks render. Production builds only
// (DEV builds skip the check so npm run tauri dev isn't poking GitHub).
if (!import.meta.env.DEV) {
  void runUpdateCheck();
}
