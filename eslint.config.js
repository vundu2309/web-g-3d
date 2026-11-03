import js from "@eslint/js";
import ts from "typescript-eslint";

export default ts.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      ".openwiki-export/**",
      "openwiki/**",
      ".agents/**",
    ],
  },
  {
    files: ["src/**/*.ts"],
    extends: [js.configs.recommended, ...ts.configs.recommended],
  },
  {
    files: ["src/hub/**/*.ts", "src/platform/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/app/**", "**/main", "**/main.ts"],
              message:
                "Game/platform modules must not depend on application orchestration.",
            },
          ],
        },
      ],
    },
  },
);
