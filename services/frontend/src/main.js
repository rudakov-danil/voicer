import { jsx as _jsx } from "react/jsx-runtime";
import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/onest';
import App from './App';
import { startTranslator } from './i18n';
import './index.css';
startTranslator();
ReactDOM.createRoot(document.getElementById('root')).render(_jsx(React.StrictMode, { children: _jsx(App, {}) }));
