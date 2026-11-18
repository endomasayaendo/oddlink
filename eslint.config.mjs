// Lints the repository's own Node scripts. Each workspace package has its own config.
import { defineConfig, globalIgnores } from "eslint/config";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([globalIgnores(["apps/**", "packages/**"]), ...nextTs]);
