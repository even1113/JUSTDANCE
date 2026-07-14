import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "prefer-const": "error",
      "no-empty": "off",
    },
  },
  {
    files: ["server.js", "build-site.js"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
