const { spawn } = require('node:child_process');
const electronBinary = require('electron');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), override: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ELECTRON_NO_ATTACH_CONSOLE;
// Local defaults are only used when no deployment URL is configured. This is
// important on hosted machines where `npm run desktop` must open the live
// instance instead of silently falling back to localhost.
if (!env.DESKTOP_HOME_SERVER && !env.PUBLIC_URL) env.DESKTOP_HOME_SERVER = 'http://localhost:3002';
if (!env.DESKTOP_CLIENT_URL && !env.PUBLIC_URL) env.DESKTOP_CLIENT_URL = 'http://localhost:5173';
const child = spawn(electronBinary, ['desktop/main.cjs', ...process.argv.slice(2)], { stdio: 'inherit', env });
child.on('close', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
