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
import { join } from 'node:path';
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
  [string]$Root,
  [string]$Name,
  [string]$NotesDir,
  [int]$HostPid
)

$ErrorActionPreference = 'SilentlyContinue'

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
$notify.ContextMenuStrip = $menu

# --- Status polling ---------------------------------------------------------
function Test-HostAlive {
  # $HostPid gone => host is dead.
  $proc = Get-Process -Id $HostPid -ErrorAction SilentlyContinue
  return [bool]$proc
}

function Test-StatusOk {
  try {
    $req = [System.Net.WebRequest]::Create("http://127.0.0.1:$Port/status")
    $req.Method = 'GET'
    $req.Timeout = 1500
    $resp = $req.GetResponse()
    $code = [int]$resp.StatusCode
    $resp.Close()
    return ($code -eq 200)
  } catch {
    return $false
  }
}

function Update-State {
  # If the host process is gone, remove the tray entirely (honest presence).
  if (-not (Test-HostAlive)) {
    try { $notify.Visible = $false; $notify.Dispose() } catch { }
    [System.Windows.Forms.Application]::Exit()
    return
  }

  if (Test-StatusOk) {
    $notify.Icon = $iconRunning
    Set-SafeText "stikfix - $Name - running on :$Port"
  } else {
    $notify.Icon = $iconStopped
    Set-SafeText "stikfix - $Name - not responding"
  }
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
