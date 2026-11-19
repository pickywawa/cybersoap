import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/orbitron/500.css';
import '@fontsource/orbitron/700.css';
import '@fontsource/orbitron/900.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import './styles.css';
import App from './App';
import { useStore } from './store';

// handy for debugging from DevTools
window.cybersoap = { store: useStore };

createRoot(document.getElementById('root')).render(<App />);
