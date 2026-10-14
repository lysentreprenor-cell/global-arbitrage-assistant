// The app is self-contained: the web client (built with vite.mobile.config.ts
// into www/) runs the ResellAssist API routes on the device.
// Set APP_SERVER_URL at build time to load a deployed server instead.
const serverUrl = process.env.APP_SERVER_URL;

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
  plugins: {
    // Native HTTP for fetch(): lets the app call Anthropic/eBay APIs without CORS limits.
    CapacitorHttp: { enabled: true },
  },
};

module.exports = config;
