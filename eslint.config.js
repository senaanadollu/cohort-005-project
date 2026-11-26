import js from "@eslint/js";
import vitest from "@vitest/eslint-plugin";
import importPlugin from "eslint-plugin-import";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import sonarjs from "eslint-plugin-sonarjs";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "build/",
      ".react-router/",
      "drizzle/",
      "node_modules/",
      "public/",
      "lessons/",
      "reference/",
      "assets/",
      "learning-records/",
      ".claude/",
      ".agents/",
      ".sandcastle/",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
      "simple-import-sort": simpleImportSort,
      import: importPlugin,
      sonarjs,
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      // React Router routes throw responses: `throw redirect()`, `throw data()`.
      "@typescript-eslint/only-throw-error": [
        "error",
        {
          allow: [
            { from: "lib", name: "Response" },
            {
              from: "package",
              package: "react-router",
              name: "DataWithResponseInit",
            },
          ],
        },
      ],
      "@typescript-eslint/no-inferrable-types": "error",
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: "variable",
          types: ["boolean"],
          format: ["PascalCase"],
          prefix: ["is", "has", "can", "should", "was", "will"],
        },
      ],
      eqeqeq: "error",
      "no-var": "error",
      "prefer-const": "error",
      "no-console": ["error", { allow: ["error"] }],
      "no-useless-catch": "error",
      "prefer-arrow-callback": "error",
      "max-lines": [
        "error",
        { max: 500, skipBlankLines: true, skipComments: true },
      ],
      "max-lines-per-function": [
        "error",
        { max: 50, skipBlankLines: true, skipComments: true },
      ],
      "max-params": ["error", 3],
      "max-depth": ["error", 3],
      "id-denylist": [
        "error",
        "req",
        "res",
        "e",
        "err",
        "ctx",
        "btn",
        "msg",
        "val",
      ],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "react/jsx-key": "error",
      "react/no-array-index-key": "error",
      "react/jsx-no-target-blank": "error",
      "react/no-danger": "error",
      "jsx-a11y/tabindex-no-positive": "error",
      "simple-import-sort/imports": [
        "error",
        { groups: [["^node:", "^@?\\w"], ["^~/"], ["^\\."]] },
      ],
      "import/no-default-export": "error",
      "sonarjs/no-commented-code": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "TSAsExpression > CallExpression[callee.property.name='get'][callee.object.name=/formData/i]",
          message: "Parse form data with a zod schema instead of casting.",
        },
        {
          selector:
            "JSXAttribute[name.name='className'] Literal[value=/#[0-9a-fA-F]{3,8}\\b/]",
          message: "Use a design token, not a raw hex colour.",
        },
        {
          selector:
            "CallExpression[callee.object.name='sql'][callee.property.name='raw']",
          message: "Parameterise the query; do not build SQL from strings.",
        },
      ],
    },
  },
  {
    files: [
      "app/routes/**",
      "app/root.tsx",
      "app/routes.ts",
      "*.config.ts",
      "*.config.js",
    ],
    rules: { "import/no-default-export": "off" },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    plugins: { vitest },
    rules: {
      "vitest/no-disabled-tests": "error",
      "vitest/no-focused-tests": "error",
      "max-lines-per-function": "off",
    },
  },
  {
    // Plain JS files are outside the TypeScript project.
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    languageOptions: { globals: globals.node },
  }
);
