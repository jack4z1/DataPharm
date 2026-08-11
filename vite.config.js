import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173 },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('jspdf')) return 'vendor-pdf';
          if (id.includes('docx')) return 'vendor-docx';
          if (id.includes('html2canvas')) return 'vendor-html2canvas';
          if (id.includes('peerjs')) return 'vendor-peerjs';
        },
      },
    },
  },
  base: './',
});
