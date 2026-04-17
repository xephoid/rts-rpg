import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import boundaries from "eslint-plugin-boundaries";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      react: reactPlugin,
      boundaries,
    },
    settings: {
      "boundaries/elements": [
        { type: "game", pattern: "src/game/*" },
        { type: "renderer", pattern: "src/renderer/*" },
        { type: "ui", pattern: "src/ui/*" },
        { type: "store", pattern: "src/store/*" },
      ],
    },
    rules: {
      // Enforce import boundaries per CLAUDE.md
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            // /game: no imports from /renderer, /ui, /store
            {
              from: "game",
              allow: [],
            },
            // /renderer: may import /game (read-only) and /store
            {
              from: "renderer",
              allow: ["game", "store"],
            },
            // /ui: may import /store only
            {
              from: "ui",
              allow: ["store"],
            },
            // /store: no cross-boundary imports
            {
              from: "store",
              allow: [],
            },
          ],
        },
      ],
      // Ban inline styles — all styling via CSS Modules
      "react/forbid-component-props": ["error", { forbid: ["style"] }],
    },
  }
);
