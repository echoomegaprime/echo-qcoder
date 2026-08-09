import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QCoderConsole } from "./App.js";

const root = document.getElementById("root");
if (!root) throw new Error("QCoder UI root is missing.");
createRoot(root).render(
  <StrictMode>
    <QCoderConsole />
  </StrictMode>,
);
