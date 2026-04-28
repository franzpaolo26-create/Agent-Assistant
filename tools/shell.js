/**
 * JARVIS OS — Tailscale Shell Tool
 * Executes remote/local commands for system control.
 * In Phase 2, this will connect to remote devices via Tailscale SSH.
 */

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// ── Allowed commands whitelist (security) ─────────────────────────────────────
// Only allow safe read operations by default.
// Franz can expand this list with SHELL_ALLOW_WRITES=true in .env
const BLOCKED_PATTERNS = [
  /rm\s+-rf/i,
  /mkfs/i,
  /dd\s+if=/i,
  />\s*\/dev/i,
  /format\s+c:/i,
  /shutdown/i,
  /reboot/i,
];

function isSafeCommand(cmd) {
  if (process.env.SHELL_UNRESTRICTED === 'true') return true;
  return !BLOCKED_PATTERNS.some(rx => rx.test(cmd));
}

// ── Local execution ───────────────────────────────────────────────────────────

/**
 * Execute a shell command locally on the server.
 * @param {string} command
 * @param {number} [timeoutMs=15000]
 * @returns {Promise<string>}
 */
async function exec_local(command, timeoutMs = 15_000) {
  if (!isSafeCommand(command)) {
    throw new Error(`Comando bloqueado por política de seguridad: "${command}"`);
  }

  const { stdout, stderr } = await execAsync(command, {
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024, // 1 MB
    shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/bash',
  });

  const output = (stdout + (stderr ? `\n[stderr]: ${stderr}` : '')).trim();
  return output || '(sin salida)';
}

/**
 * Execute a command on a remote Tailscale device via SSH.
 * Phase 2 feature — requires Tailscale + SSH configured on target device.
 *
 * @param {string} targetIp  — Tailscale IP of the device (e.g. 100.x.x.x)
 * @param {string} command
 * @param {string} [user='jarvis']
 * @returns {Promise<string>}
 */
async function exec_remote(targetIp, command, user = 'jarvis') {
  if (!isSafeCommand(command)) {
    throw new Error(`Comando bloqueado por política de seguridad.`);
  }

  // Uses SSH with Tailscale IP — no password needed if SSH keys are configured
  const sshCmd = `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 ${user}@${targetIp} "${command.replace(/"/g, '\\"')}"`;
  return exec_local(sshCmd, 20_000);
}

/**
 * Get basic system info (always local).
 */
async function systemInfo() {
  try {
    const os = require('os');
    return {
      hostname:  os.hostname(),
      platform:  os.platform(),
      arch:      os.arch(),
      uptime:    `${Math.floor(os.uptime() / 3600)}h ${Math.floor((os.uptime() % 3600) / 60)}m`,
      cpus:      os.cpus().length,
      freeMemGb: (os.freemem()  / 1024 ** 3).toFixed(2),
      totalMemGb:(os.totalmem() / 1024 ** 3).toFixed(2),
      nodeVersion: process.version,
    };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Unified exec — decides local vs remote.
 * Usage: exec('ls -la') or exec('ls -la', { remote: '100.x.x.x' })
 */
async function exec(command, opts = {}) {
  if (opts.remote) {
    return exec_remote(opts.remote, command, opts.user);
  }
  return exec_local(command, opts.timeout);
}

module.exports = { exec, exec_local, exec_remote, systemInfo, isSafeCommand };
