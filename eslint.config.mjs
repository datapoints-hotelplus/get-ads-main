import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // TanStack Table (useReactTable) is intentionally incompatible with React Compiler.
      // Components using it are opted out via "use no memo" — silence the residual warning.
      "react-compiler/react-compiler": "off",
    },
  },
]);

export default eslintConfig;
