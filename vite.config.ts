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
      checker({
        typescript: true,
        enableBuild: true,
      }),
    ],
    build: {
      rollupOptions: {
        output: {
          entryFileNames: '[name].js',
          assetFileNames: (assetInfo) => {
            if (assetInfo.names?.some((r) => r.endsWith('.css'))) {
              return 'styles.css';
            }
            return '[name].[hash].[ext]';
          },
        },
      },
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(env.NODE_ENV),
    },
  };
});
