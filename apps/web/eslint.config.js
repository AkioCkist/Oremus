import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { ignores: ['dist/**', 'public/**'] },
  {
    languageOptions: { globals: { console: 'readonly', process: 'readonly', Buffer: 'readonly', document: 'readonly', window: 'readonly', fetch: 'readonly', FormData: 'readonly', HTMLElement: 'readonly', HTMLFormElement: 'readonly', HTMLButtonElement: 'readonly', HTMLInputElement: 'readonly', Event: 'readonly', CustomEvent: 'readonly', navigator: 'readonly' } },
    rules: { '@typescript-eslint/no-explicit-any': 'off' }
  }
);

