import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tanstackStart(), viteReact()],

  // The server build carries its dependencies, so the web image needs no node_modules.
  ssr: { noExternal: true },
});
