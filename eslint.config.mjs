import globals from "globals";

import path from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import pluginJs from "@eslint/js";

// mimic CommonJS variables -- not needed if using CommonJS
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({baseDirectory: __dirname, recommendedConfig: pluginJs.configs.recommended});

export default [
  {files: ["**/*.js"], languageOptions: {sourceType: "commonjs"}},
  {languageOptions: { globals: globals.browser }},
  ...compat.extends("airbnb-base"),
  {
    "rules": {
      "indent": "off",
      "arrow-parens": "off",
      "quotes": "off",
      "linebreak-style": "off",
      "max-len": "off",
      "no-console": "off",
      "spaced-comment": "off",
      "no-trailing-spaces": "off",
      "no-else-return": "off",
      "no-multi-spaces": "off",
      "no-unused-vars": "off",
      "global-require": "off",
      "no-use-before-define": "off",
      "consistent-return": "off",
      "camelcase": "off",
      "semi": ["error", "always"]
    }
  }
];