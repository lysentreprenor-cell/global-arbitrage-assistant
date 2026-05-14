import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { bootBrowserParity } from "./browserParity";
import "./browserParity.css";

bootBrowserParity();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch(() => {});
  });
}

createRoot(document.getElementById("root")!).render(<App />);
