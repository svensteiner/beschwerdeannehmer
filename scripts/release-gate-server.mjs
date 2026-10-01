import { spawn } from "node:child_process";

const port = process.argv[2];
if (!port || port === "8092") throw new Error("Ungültiger Release-Gate-Port");
const child = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", port, "--strictPort"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    VITE_AUTH_ENABLED: "false", SILVIA_DATA_DIR: "memory", DATABASE_URL: "", SILVIA_LLM_PROVIDER: "local",
    OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", KIMI_API_KEY: "", GEMINI_API_KEY: "", XAI_API_KEY: "", SILVIA_LLM_BASE_URL: "",
    SILVIA_LIVE_DEMO_ENABLED: "0", SILVIA_BOOKING: "", SILVIA_STT_URL: "", SILVIA_TTS_URL: "",
    OLLAMA_HOST: "", HTTP_PROXY: "", HTTPS_PROXY: "", ALL_PROXY: "", NODE_USE_ENV_PROXY: "0",
  }, stdio: "inherit", windowsHide: true,
});
process.once("SIGINT", () => child.kill("SIGINT"));
process.once("SIGTERM", () => child.kill("SIGTERM"));
child.once("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
