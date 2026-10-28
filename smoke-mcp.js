// MCP stdio 冒烟测试：握手 + 列工具 + 实际调用
import { spawn } from "node:child_process";

const child = spawn("node", ["server.js"], { cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"] });
let buf = "";
const pending = new Map();
let nextId = 1;

child.stdout.on("data", d => {
  buf += d.toString();
  let idx;
  while ((idx = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    } catch { /* 忽略非 JSON 行 */ }
  }
});
child.stderr.on("data", d => process.stderr.write("[srv] " + d));

const send = (obj) => child.stdin.write(JSON.stringify(obj) + "\n");
const rpc = (method, params) => new Promise(res => {
  const id = nextId++;
  pending.set(id, res);
  send({ jsonrpc: "2.0", id, method, params });
});
const wait = (ms) => new Promise(r => setTimeout(r, ms));

await wait(500);
const init = await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke", version: "0.0" } });
console.log("initialize ok:", init.result?.serverInfo?.name, init.result?.serverInfo?.version);
send({ jsonrpc: "2.0", method: "notifications/initialized" });

const tools = await rpc("tools/list", {});
console.log("tools:", tools.result?.tools?.map(t => t.name).join(", "));

const call = async (name, args) => {
  const r = await rpc("tools/call", { name, arguments: args ?? {} });
  const text = r.result?.content?.[0]?.text;
  return text ? JSON.parse(text) : r;
};

const saves = await call("eu4_list_saves");
console.log("\neu4_list_saves:", saves.map(s => s.file).join(", "));

const ov = await call("eu4_overview", {});
console.log("eu4_overview:", JSON.stringify({ date: ov.date, player: ov.player, wars: ov.active_wars.length, gps: ov.great_powers.slice(0, 3).map(g => g.tag) }));

const hab = await call("eu4_nation", { tag: "HAB" });
console.log("eu4_nation HAB:", JSON.stringify({ neighbors: hab.neighbors?.slice(0, 6), subjects: hab.subjects?.map(s => s.tag), treasury: hab.economy?.treasury, regiments: hab.military?.regiments }));

const rel = await call("eu4_relations", { tag: "HAB" });
console.log("eu4_relations HAB:", Object.keys(rel.diplomacy ?? {}).join(","), "| opinions:", Object.keys(rel.opinions ?? {}).length);

const act = await call("eu4_act", { commands: ["set_global_flag ai_smoke_test"], name: "ai_smoke", execute: false });
console.log("eu4_act:", act.file, "lines:", act.lines, "hint:", act.hint);

const logs = await call("eu4_logs", { lines: 3 });
console.log("eu4_logs: error.log tail =", JSON.stringify(logs.error_log).slice(0, 120));

console.log("\nALL MCP SMOKE TESTS PASSED");
child.kill();
process.exit(0);
