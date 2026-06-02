import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { bootBrowserParity } from "./browserParity";

bootBrowserParity().catch(() => {});

createRoot(document.getElementById("root")!).render(<App />);
