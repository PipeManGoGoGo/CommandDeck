import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { gsap } from "./motion";
import { installChromeMotion } from "./motionChrome";
import { applyPalette, readStoredPalette } from "./theme/palettes";
import { applyTermFont, readStoredTermFont } from "./theme/fonts";
import { applyIconSize, readStoredIconSize } from "./theme/iconSize";

if (typeof window !== "undefined") {
  (window as Window & { gsap: typeof gsap }).gsap = gsap;
}

applyPalette(readStoredPalette());
applyTermFont(readStoredTermFont());
applyIconSize(readStoredIconSize());

const rootEl = document.getElementById("root")!;
ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
installChromeMotion(rootEl);

const motionRoot = document.documentElement;
const syncMotionPlayback = () => {
  const paused = document.hidden;
  motionRoot.classList.toggle("cd-motion-paused", paused);
  if (paused) gsap.globalTimeline.pause();
  else gsap.globalTimeline.resume();
};
document.addEventListener("visibilitychange", syncMotionPlayback);
syncMotionPlayback();
