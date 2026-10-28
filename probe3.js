// 探测 3：军队/统治者/战争/旗标/日期编码
import AdmZip from "adm-zip";
import { decodeBinary, loadTokenTable, tokenTablePath } from "./eu4bin.js";
import os from "node:os";
import path from "node:path";

const savePath = process.argv[2] ||
  path.join(os.homedir(), "Documents/Paradox Interactive/Europa Universalis IV/save games/111.eu4");
const table = loadTokenTable(tokenTablePath());
const zip = new AdmZip(savePath);
const game = decodeBinary(zip.getEntry("gamestate").getData().subarray(6), table);

console.log("players_countries =", JSON.stringify(game.players_countries));

const c = game.countries["ICH"];
const keys = Object.keys(c);
console.log(`\nICH keys (${keys.length}):`);
console.log(keys.join(","));

console.log("\n== army/navy/unit related ==");
for (const k of keys) if (/arm|nav|unit|force|ship|regiment|general|leader/i.test(k)) console.log(" ", k, "=>", JSON.stringify(c[k])?.slice(0, 160));
console.log("\n== ruler related ==");
for (const k of keys) if (/ruler|monarch|heir|queen|consort/i.test(k)) console.log(" ", k, "=>", JSON.stringify(c[k])?.slice(0, 300));
console.log("\n== subjects related ==");
for (const k of keys) if (/subject|colony|vassal|dependency/i.test(k)) console.log(" ", k, "=>", JSON.stringify(c[k])?.slice(0, 160));

console.log("\n== active_war ==");
const aw = game.active_war;
console.log("keys:", Object.keys(aw).join(", "));
for (const k of Object.keys(aw)) {
  const w = aw[k];
  console.log(`\n-- war [${k}]: keys = ${Object.keys(w).join(",")}`);
  console.log(JSON.stringify(w)?.slice(0, 700));
}

console.log("\n== previous_war (sample) ==");
const pw = game.previous_war;
console.log("count:", Object.keys(pw).length, "first keys:", Object.keys(pw).slice(0, 5).join(","));
const pk = Object.keys(pw)[0];
if (pk) console.log("sample:", JSON.stringify(pw[pk])?.slice(0, 400));

console.log("\n== combat ==");
console.log(JSON.stringify(game.combat)?.slice(0, 300));

console.log("\n== great_powers ==");
console.log(JSON.stringify(game.great_powers)?.slice(0, 800));

console.log("\n== flags (top-level, first 10) ==");
const fl = game.flags || {};
console.log("flag count:", Object.keys(fl).length, "sample:", JSON.stringify(Object.fromEntries(Object.entries(fl).slice(0, 10)))?.slice(0, 400));

console.log("\n== economic/trade hegemons ==");
for (const k of ["economic_hegemon", "production_leader_tag", "revolution"]) {
  console.log(" ", k, "=>", JSON.stringify(game[k])?.slice(0, 250));
}

console.log("\n== date crack ==");
const inc = game.income_statistics?.ledger_data;
if (inc) {
  const ichRow = inc.find(r => r.name === "ICH");
  if (ichRow?.data) {
    const d = ichRow.data;
    console.log("ICH income ledger last 10:", d.slice(-10));
  }
}
console.log("tech_level_dates =", JSON.stringify(game.tech_level_dates)?.slice(0, 300));
// 所有可能的日期：遍历顶层未识别键的数值
console.log("top-level date-like values:");
for (const k of Object.keys(game)) {
  const v = game[k];
  if (typeof v === "number" && v > 57000000 && v < 60000000) console.log("  ", JSON.stringify(k), "=", v);
}
