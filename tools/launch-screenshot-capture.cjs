const { spawn } = require("node:child_process");
const path = require("node:path");
const electronBinary = require("electron");

const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
delete environment.ELECTRON_NO_ATTACH_CONSOLE;

const captureScript = path.join(__dirname, "capture-screenshots.cjs");
const child = spawn(electronBinary, [captureScript], {
  stdio: "inherit",
  env: environment,
});

child.on("close", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
