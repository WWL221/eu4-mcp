// 功能测试：真实存档上的全链路提取
import { listSaves, loadSave } from "./save.js";
import { overview, nation, relationsOf, warsOf, summarizeWar } from "./extract.js";
import { writeRunFile } from "./act.js";

console.log("== saves ==");
console.log(listSaves().map(s => `${s.file} ${s.sizeMB}MB ${s.mtime}`).join("\n"));

const t0 = Date.now();
const save = await loadSave();
console.log(`\nload+decode: ${((Date.now() - t0) / 1000).toFixed(1)}s  format=${save.format}  player=${save.playerTag}  date≈${save.date}`);

const ov = overview(save);
console.log("\n== overview ==");
console.log(JSON.stringify({ ...ov, active_wars: ov.active_wars.slice(0, 2), top_nations_by_dev: ov.top_nations_by_dev.slice(0, 5) }, null, 1).slice(0, 1800));

console.log("\n== nation ICH (player) ==");
const n1 = nation(save, "ICH");
console.log(JSON.stringify(n1, (k, v) => (k === "reforms" ? undefined : v), 1).slice(0, 2200));

console.log("\n== nation HAB (AI candidate) ==");
const n2 = nation(save, "HAB");
console.log(JSON.stringify({ tag: n2.tag, neighbors: n2.neighbors, state: { stability: n2.state.stability, government: n2.state.government }, economy: n2.economy, military: { regiments: n2.military.regiments, heavy: n2.military.ships.heavy }, tech: n2.tech, subjects: n2.subjects }, null, 1));

console.log("\n== relations ICH ==");
const r = relationsOf(save, "ICH");
console.log("diplomacy types:", Object.entries(r.diplomacy).map(([k, v]) => `${k}:${v.length}`).join(", "));
console.log("alliance sample:", JSON.stringify(r.diplomacy.alliance?.slice(0, 3)));
console.log("opinions sample:", JSON.stringify(Object.fromEntries(Object.entries(r.opinions).slice(0, 5))));

console.log("\n== wars ICH ==");
const w = warsOf(save, "ICH");
console.log("wars involving ICH:", w.length);
if (w.length) console.log(JSON.stringify(w[0], null, 1).slice(0, 900));

console.log("\n== wars HAB ==");
const wh = warsOf(save, "HAB");
console.log("wars involving HAB:", wh.length);

console.log("\n== act (dry) ==");
console.log(writeRunFile(["set_global_flag ai_test_flag", "// 注释行会被游戏忽略吗？", "cash 100"], "ai_test"));
