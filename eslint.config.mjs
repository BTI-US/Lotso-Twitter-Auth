import globals from "globals";

import path from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import pluginJs from "@eslint/js";

// mimic CommonJS variables -- not needed if using CommonJS
const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const compat = new FlatCompat({ baseDirectory: dirname, recommendedConfig: pluginJs.configs.recommended });

export default [
  { files: ["**/*.js"], languageOptions: { sourceType: "commonjs" } },
  { languageOptions: { globals: globals.browser } },
  ...compat.extends("airbnb-base"),
  {
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module",
      },
    },
    rules: {
      indent: "off",
      "arrow-parens": "off",
      quotes: "off",
      "linebreak-style": "off",
      "max-len": "off",
      "no-console": "off",
      "spaced-comment": "off",
      "no-trailing-spaces": "off",
      "no-else-return": "off",
      "no-multi-spaces": "off",
      "no-unused-vars": "off",
      "global-require": "off",
      "consistent-return": "off",
      camelcase: "off",
      semi: ["error", "always"],
    },
  },
];
