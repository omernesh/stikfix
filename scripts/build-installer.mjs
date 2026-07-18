// Build the Stikfix Windows installer end-to-end.
// 1) build extension + host, 2) SEA host binary, 3) crx + update.xml,
// 4) assert artifacts, 5) compile installer with ISCC, 6) assert + report.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

function log(msg) {
  console.log(`[build-installer] ${msg}`);
}

function fail(msg) {
  console.error(`[build-installer] ERROR: ${msg}`);
  process.exit(1);
}

// Read version from package.json
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const version = pkg.version;
if (!version) fail('could not read version from package.json');
log(`stikfix version ${version}`);

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function runNpm(script) {
  log(`running: npm run ${script}`);
  // shell:true is required on Windows/Node 20+ to spawn npm.cmd (a batch file).
  execFileSync(npmCmd, ['run', script], { cwd: repoRoot, stdio: 'inherit', shell: true });
}

// 2) Build steps in order, fail fast.
for (const script of ['build', 'build:sea', 'pack:crx', 'gen:update-xml']) {
  runNpm(script);
}

// 3) Assert required artifacts exist and are non-empty.
const artifacts = [
  join(repoRoot, 'dist', 'sea', 'stikfix-host.exe'),
  join(repoRoot, 'dist', 'crx', 'stikfix.crx'),
  join(repoRoot, 'dist', 'crx', 'update.xml'),
];
for (const a of artifacts) {
  if (!existsSync(a)) fail(`missing artifact: ${a}`);
  if (statSync(a).size === 0) fail(`empty artifact: ${a}`);
  log(`ok: ${a} (${statSync(a).size} bytes)`);
}

// 4) Locate ISCC.
function findISCC() {
  // Try on PATH first.
  try {
    execFileSync('ISCC', ['/?'], { stdio: 'ignore' });
    return 'ISCC';
  } catch {
    // not on PATH
  }
  const candidates = [
    'C:\\ProgramData\\chocolatey\\bin\\ISCC.exe',
    'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
    'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  fail('could not locate ISCC.exe (not on PATH and not in known install dirs)');
}

const iscc = findISCC();
log(`using ISCC: ${iscc}`);

const issPath = join(repoRoot, 'installer', 'stikfix.iss');
if (!existsSync(issPath)) fail(`missing installer script: ${issPath}`);

log(`compiling: ${iscc} /DAppVersion=${version} ${issPath}`);
execFileSync(iscc, [`/DAppVersion=${version}`, issPath], { cwd: repoRoot, stdio: 'inherit' });

// 5) Assert the installer exe exists; report path + size.
const outExe = join(repoRoot, 'dist', 'installer', `stikfix-setup-${version}.exe`);
if (!existsSync(outExe)) fail(`installer not produced: ${outExe}`);
const sizeMb = (statSync(outExe).size / (1024 * 1024)).toFixed(2);
log('');
log('SUCCESS');
log(`installer: ${outExe}`);
log(`size:      ${sizeMb} MB`);
