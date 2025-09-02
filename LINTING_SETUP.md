# Linting Setup Guide

This repository has been configured with linting tools to help you catch errors and maintain code quality.

## Available Linting Tools

### 1. Standard.js (Already configured)
- **Command**: `npm run lint`
- **Auto-fix**: `npm run lint:fix`
- **Configuration**: `.standardrc.json`

Standard.js is a zero-configuration linter that enforces consistent JavaScript style.

### 2. ESLint (Optional - if you prefer more control)
- **Command**: `npm run lint:eslint`
- **Auto-fix**: `npm run lint:eslint:fix`
- **Configuration**: `eslint.config.js`

## Editor Integration

### VS Code
1. Install the "ESLint" extension
2. The `.vscode/settings.json` file is already configured to:
   - Enable ESLint
   - Auto-fix on save
   - Use single quotes
   - Remove semicolons
   - Trim trailing whitespace

### Other Editors
- **Sublime Text**: Install "SublimeLinter-eslint"
- **Atom**: Install "linter-eslint"
- **Vim/Neovim**: Use ALE or similar plugin

## Current Linting Status

Run `npm run lint` to see all current linting errors. The output will show:
- File paths and line numbers
- Error descriptions
- Rule names

## Common Rules

The current configuration enforces:
- Single quotes instead of double quotes
- No semicolons
- No trailing commas
- Space before function parentheses
- No trailing whitespace
- Newline at end of files

## Quick Fixes

Many issues can be automatically fixed:
```bash
npm run lint:fix
```

This will automatically fix:
- Quote style
- Semicolons
- Trailing commas
- Trailing whitespace
- Missing newlines

## Ignoring Files

Files to ignore are specified in:
- `.eslintignore` (for ESLint)
- Standard.js automatically ignores `node_modules/`, `coverage/`, etc.

## Getting Started

1. Run `npm run lint` to see current issues
2. Fix issues manually or use `npm run lint:fix`
3. Your editor should now show linting errors in real-time
4. Configure your editor to auto-fix on save for the best experience
