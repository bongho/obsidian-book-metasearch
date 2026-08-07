import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
	test: {
		environment: 'happy-dom',
		include: ['src/**/*.test.ts'],
		globals: false,
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html'],
			include: ['src/**/*.ts'],
			exclude: [
				'src/**/*.test.ts',
				'src/__mocks__/**',
			],
		},
	},
	resolve: {
		alias: {
			obsidian: fileURLToPath(
				new URL('./src/__mocks__/obsidian.ts', import.meta.url),
			),
		},
	},
});
