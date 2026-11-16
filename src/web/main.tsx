import { DesignSystemProvider } from '@workspace/ui';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Application } from './app';
import '../styles/index.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><DesignSystemProvider storageKey="codeitz.ui.preferences"><Application /></DesignSystemProvider></React.StrictMode>);
