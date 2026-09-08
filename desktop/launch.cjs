const { spawn } = require('node:child_process');
const electronBinary = require('electron');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ELECTRON_NO_ATTACH_CONSOLE;
// `npm run desktop` is the development launcher. Keep it on the local Vite UI
// even when the root .env contains production deployment values. Explicit
// shell variables can still override these defaults when needed.
env.DESKTOP_CLIENT_URL ||= 'http://localhost:5173';
env.DESKTOP_HOME_SERVER ||= 'http://localhost:3002';
const child = spawn(electronBinary, ['desktop/main.cjs', ...process.argv.slice(2)], { stdio: 'inherit', env });
child.on('close', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
