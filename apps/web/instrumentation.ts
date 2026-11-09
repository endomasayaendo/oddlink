// Runs once when the server starts. Validating here makes a bad production configuration fail at
// startup rather than on the first request that happens to need a value.
export async function register() {
  // Imported only for the Node.js runtime so the Edge bundle never sees process.exit.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { checkEnvAtStartup } = await import("./lib/check-env-at-startup");
    checkEnvAtStartup();
  }
}
