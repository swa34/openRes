import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import App from "./app";
import Loading from "./components/loading";
import "./styles/index.css";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    HydrateFallback: Loading,
    children: [
      { index: true, lazy: () => import("./pages/home") },
      { path: "features", lazy: () => import("./pages/features") },
      { path: "architecture", lazy: () => import("./pages/architecture") },
      { path: "demo", lazy: () => import("./pages/demo") },
      { path: "docs", lazy: () => import("./pages/docs") },
      { path: "*", lazy: () => import("./pages/not-found") },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
