// 命令桥：把 AI 决策写成 EU4 控制台 run 文件，并可选地自动送按键执行
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { RUN_DIR } from "./save.js";

// 把命令写入 run 文件；返回文件路径。命令里允许 // 注释
export function writeRunFile(commands, name = "ai_turn") {
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, "") || "ai_turn";
  fs.mkdirSync(RUN_DIR, { recursive: true });
  const file = path.join(RUN_DIR, `${safe}.txt`);
  const body = commands.map(c => String(c).trim()).filter(Boolean).join("\n") + "\n";
  fs.writeFileSync(file, body, "utf8");
  return { file, lines: body.trim().split("\n").length };
}

// 在 EU4 窗口自动执行：激活窗口 → 打开控制台(`) → run <name> → 回车 → 关控制台
// 前提：EU4 在运行、存档处于暂停或可输入状态、控制台当前是关闭的
export async function executeInGame(name = "ai_turn") {
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, "") || "ai_turn";
  const ps = `
Add-Type -AssemblyName System.Windows.Forms
$p = Get-Process eu4 -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { Write-Output "NO_WINDOW"; exit 2 }
$shell = New-Object -ComObject WScript.Shell
[void]$shell.AppActivate($p.Id)
Start-Sleep -Milliseconds 500
[System.Windows.Forms.SendKeys]::SendWait('{ESC}')
Start-Sleep -Milliseconds 200
[System.Windows.Forms.SendKeys]::SendWait('\`')
Start-Sleep -Milliseconds 300
[System.Windows.Forms.SendKeys]::SendWait('run ${safe}')
Start-Sleep -Milliseconds 200
[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
Start-Sleep -Milliseconds 300
[System.Windows.Forms.SendKeys]::SendWait('\`')
Write-Output "SENT to window: $($p.MainWindowTitle)"
`;
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { windowsHide: true });
    let out = "", err = "";
    child.stdout.on("data", d => out += d);
    child.stderr.on("data", d => err += d);
    child.on("error", reject);
    child.on("close", code => {
      if (out.includes("NO_WINDOW")) return reject(new Error("未找到运行中的 EU4 窗口"));
      resolve({ code, output: out.trim(), stderr: err.trim() });
    });
  });
}

// 尾读日志（错误排查用）
export function tailLogs(lines = 30) {
  const read = (f) => {
    try {
      const text = fs.readFileSync(f, "utf8").trimEnd();
      return text.split("\n").slice(-lines).join("\n");
    } catch { return "(不存在)"; }
  };
  return {
    error_log: read(path.join(path.dirname(RUN_DIR), "logs", "error.log")),
    game_log_tail: read(path.join(path.dirname(RUN_DIR), "logs", "game.log")),
  };
}
