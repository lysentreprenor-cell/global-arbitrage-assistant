import type { CapacitorConfig } from "@capacitor/cli";

// URL of the deployed Express server (serves both the web client and /api).
// Set APP_SERVER_URL at build time, e.g. APP_SERVER_URL=https://my-app.replit.app
const serverUrl = process.env.APP_SERVER_URL;

const config: CapacitorConfig = {
  appId: "com.itemprise.app",
  appName: "ItemPrise",
  webDir: "www",
  backgroundColor: "#0D0D0F",
  server: serverUrl
    ? { url: serverUrl, cleartext: serverUrl.startsWith("http://") }
    : undefined,
  android: {
    allowMixedContent: false,
  },
};

export default config;
