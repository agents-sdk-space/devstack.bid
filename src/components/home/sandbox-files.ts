/**
 * Files for the home live example. Same shape as the owner's reference sandbox
 * (codesandbox.io/p/sandbox/pvtdl8, the react.dev Quick Start MyButton example):
 * src/App.tsx in TypeScript, App.js re-exporting it, index.js and styles.css.
 */
export const APP_TSX = `function MyButton() {
  return <button>I'm a button</button>;
}

export default function MyApp() {
  return (
    <div>
      <h1>Welcome to my app</h1>
      <MyButton />
    </div>
  );
}
`;

export const STYLES_CSS = `* {
  box-sizing: border-box;
}

body {
  font-family: sans-serif;
  margin: 20px;
  padding: 0;
}

h1 {
  margin-top: 0;
  font-size: 22px;
}

button {
  display: block;
  margin-bottom: 10px;
  padding: 6px 12px;
  border: 1px solid currentColor;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
}
`;

const APP_JS = `export { default } from "./src/App";
`;

const INDEX_JS = `import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./theme.css";

import App from "./App";

const root = createRoot(document.getElementById("root"));
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
`;

/** Hidden file that makes the preview follow the site theme (monochrome). */
export function themeCss(dark: boolean): string {
  return dark
    ? "html{color-scheme:dark}body{background:#0a0a0a;color:#fafafa}"
    : "html{color-scheme:light}body{background:#ffffff;color:#0a0a0a}";
}

export function sandboxFiles(dark: boolean) {
  return {
    "/src/App.tsx": { code: APP_TSX, active: true },
    "/styles.css": { code: STYLES_CSS },
    "/App.js": { code: APP_JS, hidden: true },
    "/index.js": { code: INDEX_JS, hidden: true },
    "/theme.css": { code: themeCss(dark), hidden: true },
  };
}
