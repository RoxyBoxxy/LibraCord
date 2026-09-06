const { spawn } = require('node:child_process');
const electronBinary = require('electron');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ELECTRON_NO_ATTACH_CONSOLE;
const child = spawn(electronBinary, ['desktop/main.cjs', ...process.argv.slice(2)], { stdio: 'inherit', env });
child.on('close', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
