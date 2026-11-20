import js from "@eslint/js";
import globals from "globals";
import security from "eslint-plugin-security";

export default [
  {
    ignores: ["node_modules/**", "coverage/**", "bruno/**", ".husky/**"]
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node
      }
    },
    plugins: {
      security
    },
    rules: {
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_"
        }
      ],
      "security/detect-buffer-noassert": "error",
      "security/detect-child-process": "error",
      "security/detect-disable-mustache-escape": "error",
      "security/detect-eval-with-expression": "error",
      "security/detect-new-buffer": "error",
      "security/detect-no-csrf-before-method-override": "error",
      "security/detect-non-literal-require": "error",
      "security/detect-pseudoRandomBytes": "error",
      "security/detect-unsafe-regex": "error",
      "security/detect-bidi-characters": "error",
      "security/detect-invisible-characters": "error"
    }
  },
  {
    files: ["scripts/perf/**/*.js"],
    languageOptions: {
      globals: {
        __ENV: "readonly"
      }
    }
  }
];
