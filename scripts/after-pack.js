const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

exports.default = async function afterPack(context) {
  if (!context || context.electronPlatformName !== 'win32') return;

  const exePath = path.join(context.appOutDir, 'MDowner.exe');
  const iconPath = path.join(context.packager.projectDir, 'assets', 'icons', 'icon.ico');
  const rceditPath = path.join(context.packager.projectDir, 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe');

  await execFileAsync(rceditPath, [
    exePath,
    '--set-icon', iconPath,
    '--set-version-string', 'FileDescription', 'MDowner',
    '--set-version-string', 'ProductName', 'MDowner',
    '--set-version-string', 'InternalName', 'MDowner',
    '--set-version-string', 'OriginalFilename', 'MDowner.exe'
  ]);
};
