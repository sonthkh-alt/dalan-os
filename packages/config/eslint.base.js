import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

/** Cau hinh ESLint flat dung chung cho moi goi TypeScript. */
export default tseslint.config(
  { ignores: ["dist/**", ".next/**", "coverage/**", "generated/**", "node_modules/**"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["warn", { prefer: "type-imports" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  prettier,
);
