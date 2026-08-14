import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SettingsApp } from "./SettingsApp";
import "./popup.css";

const root = document.getElementById("root");
if (!root) throw new Error("Popup root is missing");

createRoot(root).render(<StrictMode><SettingsApp /></StrictMode>);
