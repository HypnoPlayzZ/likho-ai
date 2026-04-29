import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";

function App() {
  const [capturedText, setCapturedText] = useState<string | null>(null);

  // Listen for text capture and overlay hide events from Rust
  useEffect(() => {
    const unlistenCapture = listen<string>("text-captured", (event) => {
      setCapturedText(event.payload);
    });

    const unlistenHidden = listen("overlay-hidden", () => {
      setCapturedText(null);
    });

    return () => {
      unlistenCapture.then((fn) => fn());
      unlistenHidden.then((fn) => fn());
    };
  }, []);

  // Fallback Esc handler for when the user has clicked inside the overlay
  useEffect(() => {
    const appWindow = getCurrentWindow();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        appWindow.hide();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const hasText = capturedText !== null && capturedText.trim().length > 0;

  return (
    <div className="flex items-center justify-center h-full bg-likho-cream/95 backdrop-blur-md rounded-xl shadow-2xl p-4">
      <div className="text-center w-full">
        {capturedText === null ? (
          <div className="flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-likho-indigo border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-likho-slate">Capturing text...</p>
          </div>
        ) : hasText ? (
          <>
            <p className="text-xs text-likho-slate mb-2 uppercase tracking-wide">
              Selected text
            </p>
            <div className="bg-white/80 rounded-lg p-3 max-h-32 overflow-y-auto text-left">
              <p className="text-sm text-likho-ink whitespace-pre-wrap break-words">
                {capturedText}
              </p>
            </div>
            <p className="text-xs text-likho-slate mt-3">Press Esc to close</p>
          </>
        ) : (
          <>
            <p className="text-base text-likho-ink font-medium">
              Select some text first
            </p>
            <p className="text-xs text-likho-slate mt-1">
              Highlight text in any app, then press Alt+Space
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
