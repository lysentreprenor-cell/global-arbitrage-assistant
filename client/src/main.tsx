import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { bootBrowserParity } from "./browserParity";
import "./browserParity.css";

bootBrowserParity();

if ("serviceWorker" in navigator) {
  if (import.meta.env.DEV) {
    // W dev wyrejestrowujemy SW żeby zmiany były widoczne od razu
    navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
  } else {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {});
    });
  }
}

createRoot(document.getElementById("root")!).render(<App />);
