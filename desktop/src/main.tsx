import { createRoot } from "react-dom/client";
import { DesignSystemProvider } from "@workspace/ui";
import { DesktopWorkspace } from "./workspace";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <DesignSystemProvider storageKey="codeitz.desktop.appearance">
    <DesktopWorkspace />
  </DesignSystemProvider>,
);
