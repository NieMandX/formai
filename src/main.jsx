import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
async function start() {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has("xr")) {
    const { XRDevice, metaQuest3 } = await import("iwer");
    const device = new XRDevice(metaQuest3);
    const nativeVR = await navigator.xr
      ?.isSessionSupported("immersive-vr")
      .catch(() => false);
    if (!nativeVR) {
      device.installRuntime({ forceInstall: true });
      device.stereoEnabled = false;
      window.__questDevice = device;
    }
  }
  createRoot(document.getElementById("root")).render(<App />);
}
start();
