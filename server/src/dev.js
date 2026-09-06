import net from "node:net";
import { spawn } from "node:child_process";
import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../.env") });

const port = Number(process.env.PORT || 3002);
const probe = net.createConnection({ host: "127.0.0.1", port });
probe.once("connect", () => {
  console.log(`LibraCord API is already running on port ${port}; using the existing process.`);
  probe.destroy();
  process.exit(0);
});
probe.once("error", () => {
  probe.destroy();
  const child = spawn(process.execPath, ["--watch", "src/index.js"], { stdio: "inherit", env: process.env });
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
});
