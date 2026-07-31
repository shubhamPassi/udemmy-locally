import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
    {
        ignores: [
            'dist/**',
            'node_modules/**',
            'server/node_modules/**',
            'coverage/**',
            '*.log',
        ],
    },
    js.configs.recommended,
    {
        files: ['src/**/*.{js,jsx}', 'server/**/*.js', 'python/**/*.js', '*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.es2024,
            },
            parserOptions: {
                ecmaFeatures: {
                    jsx: true,
                },
            },
        },
        plugins: {
            react,
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
        },
        settings: {
            react: {
                version: 'detect',
            },
        },
        rules: {
            ...react.configs.recommended.rules,
            ...react.configs['jsx-runtime'].rules,
            ...reactHooks.configs.recommended.rules,
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            'no-empty': 'off',
            'no-case-declarations': 'off',
            'no-useless-escape': 'off',
            'react/prop-types': 'off',
            'react/no-unescaped-entities': 'off',
            'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
        },
    },
]
