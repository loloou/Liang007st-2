import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { resolve } from "path";

export default defineConfig(({ mode }) => {
  const isTest = mode === 'test';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: "0.0.0.0"
    },
    base: './',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(__dirname, 'index.html'),
      },
    },
    ...(isTest ? {
      test: {
        globals: true,
        environment: 'happy-dom',
        setupFiles: ['./src/test/setup.ts'],
        include: ['src/**/*.{test,spec}.{ts,tsx}'],
        coverage: {
          provider: 'v8',
          reporter: ['text', 'json', 'html'],
          include: ['src/**/*.{ts,tsx}'],
          exclude: ['src/**/*.d.ts', 'src/test/**'],
        },
      }
    } : {}),
  };
});
