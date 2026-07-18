/**
 * Windows system-tray indicator for stikfix-host.
 *
 * Best-effort, cosmetic, Windows-only. Spawns a hidden PowerShell WinForms
 * NotifyIcon helper that polls the host's token-less /status endpoint and shows
 * running (green) / not-responding (grey) state, plus a context menu to open the
 * notes folder, stop the host, or quit the tray.
 *
 * Hard constraints (see project CLAUDE.md):
 *  - Node builtins only — NO new npm dependency. The tray is a PowerShell helper,
 *    not a Node native tray lib.
 *  - Windows-only: complete no-op (returns null) on macOS/Linux.
 *  - Never crash the host: any failure to write the script or spawn PowerShell is
 *    caught, logged as a single stderr line, and swallowed. A dropped note or a
 *    failed host start because of the tray would be an unacceptable regression.
 *  - Security: the tray only GETs http://127.0.0.1:<port>/status (existing
 *    token-less health endpoint). It weakens nothing.
 *
 * No side effects at import time: startTray() must be *called* to spawn anything.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export interface TrayOptions {
  port: number;
  root: string;
  name: string;
  notesDir: string;
  hostPid: number;
}

/**
 * Directory + path where the embedded tray script is written on each start.
 * Rewriting every start keeps the tray script in lockstep with the host version.
 * Exported (pure) for unit testing without spawning PowerShell.
 */
export function trayScriptPath(): string {
  return join(homedir(), '.local', 'share', 'stikfix', 'stikfix-tray.ps1');
}

/**
 * The embedded PowerShell tray script. A template constant so writing it is a
 * plain fs write — no external file to ship, always matches this host version.
 *
 * Design notes:
 *  - Robust icon: try to load a shipped stikfix.ico from a few candidate paths
 *    (relative to the host bundle and to $Root); fall back to SystemIcons.
 *  - Running/stopped state is shown *robustly* by switching between two stock
 *    SystemIcons (Application = running, Warning = not responding) AND always
 *    reflecting state in the tooltip text, so the state is obvious regardless of
 *    whether the custom .ico loaded.
 *  - A Timer (~3s) polls /status with a short timeout. Throw / non-200 => grey.
 *  - The timer also checks the host process: if Get-Process -Id $HostPid is gone,
 *    dispose the icon and exit, so a dead host removes the tray (honest presence).
 *  - Proper WinForms message loop via ApplicationContext so menu + timer work.
 */
export const TRAY_PS1 = String.raw`param(
  [int]$Port,
  [string]$IconPath,
  [string]$Root,
  [string]$Name,
  [string]$NotesDir,
  [int]$HostPid
)

$ErrorActionPreference = 'SilentlyContinue'

# --- Update state (script scope) --------------------------------------------
# Set when GET /status reports an available update; consumed by the update menu
# item's click handler. UpdateShown gates the one-time "update available" balloon.
$script:UpdateShown = $false
$script:PendingUrl = ''
$script:PendingSha = ''

try {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
} catch {
  # Without WinForms/Drawing there is no tray to draw. Exit quietly.
  return
}

# --- Resolve a custom app icon, else fall back to a stock icon -------------
function Get-BaseIcon {
  $candidates = @(
    $IconPath,
    (Join-Path $PSScriptRoot 'stikfix.ico'),
    (Join-Path $Root '.output\chrome-mv3\icon\stikfix.ico'),
    (Join-Path $Root 'public\icon\stikfix.ico')
  )
  foreach ($p in $candidates) {
    if ($p -and (Test-Path -LiteralPath $p)) {
      try { return New-Object System.Drawing.Icon($p) } catch { }
    }
  }
  return $null
}

$customIcon = Get-BaseIcon
$iconRunning = if ($customIcon) { $customIcon } else { [System.Drawing.SystemIcons]::Application }
$iconStopped = [System.Drawing.SystemIcons]::Warning

# --- NotifyIcon -------------------------------------------------------------
$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = $iconRunning
$notify.Visible = $true

# NotifyIcon.Text has a 63-char limit; guard so a long $Name never throws.
function Set-SafeText([string]$t) {
  if ($t.Length -gt 63) { $t = $t.Substring(0, 60) + '...' }
  $notify.Text = $t
}
Set-SafeText "stikfix - $Name - starting on :$Port"

# --- Context menu -----------------------------------------------------------
$menu = New-Object System.Windows.Forms.ContextMenuStrip

# Update item — first in the menu, hidden until an update is detected. Clicking
# it downloads the new installer, verifies its SHA-256, and runs it (one UAC
# prompt). The elevated installer stops the old host, swaps files, and restarts
# it; this tray self-disposes when the old host process dies.
$miUpdate = New-Object System.Windows.Forms.ToolStripMenuItem
$miUpdate.Text = 'Update Stikfix'
$miUpdate.Add_Click({
  $url = $script:PendingUrl
  $sha = $script:PendingSha
  if ([string]::IsNullOrEmpty($url) -or [string]::IsNullOrEmpty($sha)) {
    try { $notify.ShowBalloonTip(5000, 'Stikfix', 'Update details unavailable', [System.Windows.Forms.ToolTipIcon]::Warning) } catch { }
    return
  }
  try { $notify.ShowBalloonTip(5000, 'Stikfix', 'Downloading Stikfix update...', [System.Windows.Forms.ToolTipIcon]::Info) } catch { }
  $tmp = Join-Path $env:TEMP 'stikfix-update-setup.exe'
  try {
    $wc = New-Object System.Net.WebClient
    $wc.DownloadFile($url, $tmp)
    $wc.Dispose()
  } catch {
    try { $notify.ShowBalloonTip(5000, 'Stikfix', 'Download failed', [System.Windows.Forms.ToolTipIcon]::Error) } catch { }
    return
  }
  # Security gate: verify SHA-256 before executing the installer.
  $actual = ''
  try { $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $tmp).Hash } catch { }
  if ([string]::IsNullOrEmpty($actual) -or ($actual -ine $sha)) {
    try { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue } catch { }
    try { $notify.ShowBalloonTip(5000, 'Stikfix', 'Update verification failed - not installing.', [System.Windows.Forms.ToolTipIcon]::Error) } catch { }
    return
  }
  try {
    $notify.ShowBalloonTip(5000, 'Stikfix', "Installing update - you'll see a permission prompt.", [System.Windows.Forms.ToolTipIcon]::Info)
    Start-Process -FilePath $tmp -ArgumentList '/SILENT','/SUPPRESSMSGBOXES','/NORESTART'
  } catch {
    try { $notify.ShowBalloonTip(5000, 'Stikfix', 'Could not launch the update installer.', [System.Windows.Forms.ToolTipIcon]::Error) } catch { }
  }
})

$miOpen = New-Object System.Windows.Forms.ToolStripMenuItem
$miOpen.Text = 'Open notes folder'
$miOpen.Add_Click({
  try { Start-Process explorer.exe -ArgumentList @($NotesDir) } catch { }
})

$miStop = New-Object System.Windows.Forms.ToolStripMenuItem
$miStop.Text = 'Stop host'
$miStop.Add_Click({
  try { Stop-Process -Id $HostPid -Force -ErrorAction SilentlyContinue } catch { }
  try { $notify.Visible = $false; $notify.Dispose() } catch { }
  [System.Windows.Forms.Application]::Exit()
})

$miQuit = New-Object System.Windows.Forms.ToolStripMenuItem
$miQuit.Text = 'Quit tray (host keeps running)'
$miQuit.Add_Click({
  try { $notify.Visible = $false; $notify.Dispose() } catch { }
  [System.Windows.Forms.Application]::Exit()
})

[void]$menu.Items.Add($miOpen)
[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
[void]$menu.Items.Add($miStop)
[void]$menu.Items.Add($miQuit)

# Update item + its separator go FIRST (index 0/1), hidden until an update lands.
$sepUpdate = New-Object System.Windows.Forms.ToolStripSeparator
$menu.Items.Insert(0, $sepUpdate)
$menu.Items.Insert(0, $miUpdate)
$miUpdate.Visible = $false
$sepUpdate.Visible = $false

$notify.ContextMenuStrip = $menu

# --- Status polling ---------------------------------------------------------
function Test-HostAlive {
  # $HostPid gone => host is dead.
  $proc = Get-Process -Id $HostPid -ErrorAction SilentlyContinue
  return [bool]$proc
}

# Fetch /status, read + parse the JSON body, and return a hashtable:
#   @{ Ok = <bool health>; Update = <the .update object or $null> }
# Any failure (throw, non-200, unparseable body) => @{ Ok = $false; Update = $null }.
function Get-HostStatus {
  try {
    $req = [System.Net.WebRequest]::Create("http://127.0.0.1:$Port/status")
    $req.Method = 'GET'
    $req.Timeout = 1500
    $resp = $req.GetResponse()
    $code = [int]$resp.StatusCode
    $body = ''
    try {
      $stream = $resp.GetResponseStream()
      $reader = New-Object System.IO.StreamReader($stream)
      $body = $reader.ReadToEnd()
      $reader.Close()
    } catch { }
    $resp.Close()
    if ($code -ne 200) { return @{ Ok = $false; Update = $null } }
    $update = $null
    try {
      $json = $body | ConvertFrom-Json
      if ($json -and ($json.PSObject.Properties.Name -contains 'update')) {
        $update = $json.update
      }
    } catch { }
    return @{ Ok = $true; Update = $update }
  } catch {
    return @{ Ok = $false; Update = $null }
  }
}

function Update-State {
  # If the host process is gone, remove the tray entirely (honest presence).
  if (-not (Test-HostAlive)) {
    try { $notify.Visible = $false; $notify.Dispose() } catch { }
    [System.Windows.Forms.Application]::Exit()
    return
  }

  $status = Get-HostStatus
  $ok = $status.Ok
  $update = $status.Update

  # Compute the base running/stopped tooltip; the update suffix is appended below.
  if ($ok) {
    $notify.Icon = $iconRunning
    $tip = "stikfix - $Name - running on :$Port"
  } else {
    $notify.Icon = $iconStopped
    $tip = "stikfix - $Name - not responding"
  }

  # Surface an available update (guarded — $update is $null on old hosts).
  $hasUpdate = $false
  try { $hasUpdate = ($update -ne $null) -and ($update.available -eq $true) } catch { $hasUpdate = $false }

  if ($hasUpdate) {
    $latest = $update.latestVersion
    $script:PendingUrl = [string]$update.url
    $script:PendingSha = [string]$update.sha256
    try {
      $miUpdate.Text = "Update Stikfix (v$latest)"
      $miUpdate.Visible = $true
      $sepUpdate.Visible = $true
    } catch { }
    $tip = "$tip - update v$latest available"
    if ($script:UpdateShown -eq $false) {
      try {
        $notify.ShowBalloonTip(5000, 'Stikfix update available', "Version $latest is ready. Right-click the tray icon then Update Stikfix.", [System.Windows.Forms.ToolTipIcon]::Info)
      } catch { }
      $script:UpdateShown = $true
    }
  } else {
    try {
      $miUpdate.Visible = $false
      $sepUpdate.Visible = $false
    } catch { }
  }

  Set-SafeText $tip
}

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 3000
$timer.Add_Tick({ Update-State })
$timer.Start()

# First update immediately so the tooltip is correct without waiting 3s.
Update-State

# --- Message loop -----------------------------------------------------------
$ctx = New-Object System.Windows.Forms.ApplicationContext
[System.Windows.Forms.Application]::Run($ctx)

# Cleanup on exit.
try { $timer.Stop(); $timer.Dispose() } catch { }
try { $notify.Visible = $false; $notify.Dispose() } catch { }
`;

/**
 * Start the Windows tray helper.
 *
 * Returns the spawned ChildProcess (so the host can kill it on shutdown), or
 * null on any non-win32 platform or on any failure. NEVER throws.
 */
export function startTray(opts: TrayOptions): ChildProcess | null {
  if (process.platform !== 'win32') {
    return null;
  }

  try {
    const ps1Path = trayScriptPath();
    mkdirSync(join(homedir(), '.local', 'share', 'stikfix'), { recursive: true });
    writeFileSync(ps1Path, TRAY_PS1, { encoding: 'utf8' });

    // Installed host ships stikfix.ico next to the exe ({app}\stikfix.ico). For npx/dev this points at node's dir and simply won't resolve — Get-BaseIcon falls back to a stock icon.
    const iconPath = join(dirname(process.execPath), 'stikfix.ico');

    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-WindowStyle',
        'Hidden',
        '-File',
        ps1Path,
        '-Port',
        String(opts.port),
        '-IconPath',
        iconPath,
        '-Root',
        opts.root,
        '-Name',
        opts.name,
        '-NotesDir',
        opts.notesDir,
        '-HostPid',
        String(opts.hostPid),
      ],
      {
        // Not detached: we want it to be a child the host can kill on exit.
        windowsHide: true,
        stdio: 'ignore',
      },
    );

    // A spawn error (e.g. powershell.exe missing) arrives asynchronously; swallow
    // it so it never becomes an unhandled 'error' event that crashes the host.
    child.on('error', (e: unknown) => {
      console.error('stikfix: tray unavailable:', e instanceof Error ? e.message : String(e));
    });

    return child;
  } catch (e) {
    console.error('stikfix: tray unavailable:', e instanceof Error ? e.message : String(e));
    return null;
  }
}
