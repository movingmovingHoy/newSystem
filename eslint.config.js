import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'

export default tseslint.config([
  globalIgnores(['dist', 'node_modules', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    rules: {
      // AGENTS.md 5장: 한 파일은 한 책임. 300줄 초과는 경고(강제 아님)
      'max-lines': [
        'warn',
        { max: 300, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  {
    // 테스트와 설정 파일은 node 전역 허용
    files: ['**/*.test.{ts,tsx}', 'src/test/**', '*.config.{ts,js}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
])
