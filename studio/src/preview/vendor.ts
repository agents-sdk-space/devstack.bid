/**
 * Runtime for the static preview iframe, built as an IIFE (vite.preview.config.ts) into
 * public/preview/vendor.js. The host fetches it once and posts it to the sandboxed iframe.
 * Only these packages are importable by generated apps (no npm install in the browser).
 */
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as ReactDOMClient from 'react-dom/client';
import * as JsxRuntime from 'react/jsx-runtime';

(globalThis as unknown as { __nvxPreviewVendor: Record<string, unknown> }).__nvxPreviewVendor = {
  react: React,
  'react-dom': ReactDOM,
  'react-dom/client': ReactDOMClient,
  'react/jsx-runtime': JsxRuntime,
  'react/jsx-dev-runtime': JsxRuntime,
};
