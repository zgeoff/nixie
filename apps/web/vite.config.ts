import babel from '@rolldown/plugin-babel';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tanstackStart(), viteReact(), babel({ presets: [reactCompilerPreset()] })],

  // The server build carries its dependencies, so the web image needs no node_modules.
  ssr: { noExternal: true },
});
