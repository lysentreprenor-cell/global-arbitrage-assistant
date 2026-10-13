// URL of the deployed Express server (serves both the web client and /api).
// Override with APP_SERVER_URL at build time.
const serverUrl =
  process.env.APP_SERVER_URL || "https://global-arbitrage-assistantxgyiguddh.replit.app";

/** @type {import('@capacitor/cli').CapacitorConfig} */
const config = {
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

module.exports = config;
