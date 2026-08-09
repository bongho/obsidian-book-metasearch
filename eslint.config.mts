import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'coverage',
		'esbuild.config.mjs',
		'vitest.config.ts',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		rules: {
			// The rule can't tell UI copy from Korean prose, provider brand names,
			// or literal sample values, so it flags all three. Teach it the vocabulary
			// this plugin actually uses instead of turning the rule off — that would
			// also stop it checking the English UI strings, which we do want checked.
			'obsidianmd/ui/sentence-case': [
				'warn',
				{
					acronyms: ['ISBN', 'TTB', 'REST', 'API', 'UI', 'OK'],
					// Note: the rule's built-in brand list contains "Cursor" (the editor),
					// so "Insert book citation at cursor" — a text cursor — gets flagged.
					brands: [
						'Naver',
						'Aladin',
						'Kakao',
						'Google Books',
						'Open Library',
						'Obsidian',
					],
					ignoreRegex: [
						// Korean UI copy: sentence case is an English-only concept.
						'[\\uAC00-\\uD7A3]',
						// Placeholders showing a literal value, not prose: API key shapes,
						// vault paths, and the case-style option labels.
						'^ttbX+$',
						'^a1b2c3d4',
						'^AIza',
						'^(camelCase|snake_case|kebab-case)$',
						'^\\d+\\. References',
						'^aladin, kakao',
					],
				},
			],
		},
	},
	{
		files: ['src/**/*.test.ts', 'src/__mocks__/**/*.ts'],
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-unused-vars': 'off',
			'no-console': 'off',
		},
	},
);
