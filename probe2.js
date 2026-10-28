// 深入探测：顶层键 / 玩家国 / 战争 / 外交
import AdmZip from "adm-zip";
import { decodeBinary, loadTokenTable, tokenTablePath } from "./eu4bin.js";
import os from "node:os";
import path from "node:path";

const savePath = process.argv[2] ||
  path.join(os.homedir(), "Documents/Paradox Interactive/Europa Universalis IV/save games/111.eu4");

const table = loadTokenTable(tokenTablePath());
const zip = new AdmZip(savePath);
const gs = zip.getEntry("gamestate").getData();
const game = decodeBinary(gs.subarray(6), table);

console.log("== ALL top-level keys ==");
console.log(Object.keys(game).join(", "));

// 找包含 war 的键
for (const k of Object.keys(game)) {
  if (/war/i.test(k)) console.log("war-ish key:", k, "=>", typeof game[k], Array.isArray(game[k]) ? game[k].length : "");
}

const countries = game.countries;
const player = "ICH"; // 二进制 gamestate 开头读到的 player tag
const c = countries[player];
if (c) {
  console.log(`\n== ${player} selected fields ==`);
  const pick = ["government_rank", "capital", "capped_development", "realm_development", "prestige", "stability", "treasury", "estimated_monthly_income", "manpower", "max_manpower", "max_sailors", "religious_unity", "legitimacy", "mercantilism", "num_of_cities", "num_of_ports", "land_morale", "naval_morale", "army_tradition", "navy_tradition", "inflation", "corruption", "power_projection", "splendor"];
  for (const k of pick) if (c[k] !== undefined) console.log(`  ${k} = ${JSON.stringify(c[k])}`);
  console.log("  powers =", JSON.stringify(c.powers));
  console.log("  technology =", JSON.stringify(c.technology));
  console.log("  active_idea_groups =", JSON.stringify(c.active_idea_groups)?.slice(0, 300));
  console.log("  government =", JSON.stringify(c.government)?.slice(0, 200));
  console.log("  primary_culture =", JSON.stringify(c.primary_culture), " religion =", JSON.stringify(c.religion));
  console.log("  history keys =", Object.keys(c.history || {}).slice(0, 20).join(","));
  const hist = c.history || {};
  console.log("  last ruler =", JSON.stringify(hist.ruler)?.slice(0, 300));
  console.log("  active_relations tags =", Object.keys(c.active_relations || {}).slice(0, 25).join(","));
  const ar = c.active_relations || {};
  const sampleTag = Object.keys(ar)[0];
  if (sampleTag) console.log(`  active_relations[${sampleTag}] =`, JSON.stringify(ar[sampleTag])?.slice(0, 300));
  console.log("  ai keys =", Object.keys(c.ai || {}).join(","));
  console.log("  ai.war =", JSON.stringify(c.ai?.war)?.slice(0, 200));
} else {
  console.log(`no country ${player}`);
}

console.log("\n== diplomacy ==");
const d = game.diplomacy || {};
console.log("diplomacy keys:", Object.keys(d).join(","));
for (const k of Object.keys(d)) {
  const v = d[k];
  console.log(`  ${k}: ${Array.isArray(v) ? v.length + " entries, first=" + JSON.stringify(v[0])?.slice(0, 200) : JSON.stringify(v)?.slice(0, 200)}`);
}

console.log("\n== wars ==");
const wars = game.wars || game.active_wars || {};
const wArr = Array.isArray(wars) ? wars : Object.values(wars);
console.log("wars:", wArr.length);
if (wArr.length) {
  const w = wArr[0];
  console.log("war keys:", Object.keys(w).join(","));
  console.log("war sample:", JSON.stringify(w)?.slice(0, 600));
}

console.log("\n== great powers / score ==");
// 找分数排序相关字段
for (const k of Object.keys(game)) {
  if (/great|score|power/i.test(k)) console.log(" ", k, "=>", JSON.stringify(game[k])?.slice(0, 200));
}

console.log("\n== date etc ==");
for (const k of ["date", "start_date", "age_splendor", "current_age"]) {
  if (game[k] !== undefined) console.log(" ", k, "=", JSON.stringify(game[k]));
}
