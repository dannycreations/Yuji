import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import checker from 'vite-plugin-checker';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      mode !== 'production' &&
        checker({
          typescript: true,
          enableBuild: false,
        }),
    ].filter(Boolean),
    build: {
      rollupOptions: {
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: (chunk) => {
            const name = chunk.name.replace(/_/, '');
            return `assets/${name}-[hash].js`;
          },
          assetFileNames: (assetInfo) => {
            if (assetInfo.names?.some((r) => r.endsWith('.css'))) {
              return 'styles.css';
            }

            const name = (assetInfo.names?.[0] ?? 'asset').replace(/_/, '');
            return `assets/${name}-[hash].js`;
          },
          manualChunks: (id: string) => {
            if (id.includes('node_modules')) {
              if (id.includes('mermaid')) return 'mermaid';
              if (id.includes('katex')) return 'katex';
              if (id.includes('react')) return 'react';
              return 'vendor';
            }
          },
        },
      },
      chunkSizeWarningLimit: 3000,
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(env.NODE_ENV),
    },
  };
});
