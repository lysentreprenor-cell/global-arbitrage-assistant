import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Unregister old service workers from previous builds to prevent stale cache black screens
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(r => r.unregister());
  });
}

createRoot(document.getElementById("root")!).render(<App />);
