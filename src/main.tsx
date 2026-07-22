import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

const savedTheme = localStorage.getItem("secbox-theme");
document.documentElement.dataset.theme = savedTheme === "light" ? "light" : "dark";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
