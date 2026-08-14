import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", ".fma/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    files: ["**/*.{ts,tsx,js,mjs}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        chrome: "readonly"
      }
    },
    rules: {
      "no-console": ["error", { "allow": ["warn", "error"] }],
      "@typescript-eslint/no-explicit-any": "off"
    }
  }
);
