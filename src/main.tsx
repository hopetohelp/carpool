import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { registerServiceWorker } from "./lib/push";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// עובד הרקע נדרש להתראות הדחיפה ולהתקנה כאפליקציה
void registerServiceWorker();
