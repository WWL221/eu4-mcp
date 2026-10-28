// 探测 EU4 存档结构：列出 zip 条目、顶层键、样例国家字段、战争与外交结构
import AdmZip from "adm-zip";
import { Jomini } from "jomini";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const savePath = process.argv[2] ||
  path.join(os.homedir(), "Documents/Paradox Interactive/Europa Universalis IV/save games/111.eu4");

const zip = new AdmZip(savePath);
const entries = zip.getEntries().map(e => `${e.entryName} (${e.header.size} bytes)`);
console.log("== zip entries ==");
console.log(entries.join("\n"));

const read = (name) => {
  const e = zip.getEntry(name);
  return e ? e.getData().toString("utf8") : null;
};

// meta 或 gamestate，按实际条目名取
let metaText = read("meta");
let gameText = read("gamestate");
if (!metaText && !gameText) {
  // 旧格式：整个文件就是明文
  metaText = null;
  gameText = fs.readFileSync(savePath, "utf8");
}
console.log("\n== meta head ==");
console.log(metaText ? metaText.slice(0, 400) : "(no meta)");

console.log("\n== parsing gamestate ==");
const jomini = await Jomini.initialize();
const t0 = Date.now();
const game = jomini.parseText(gameText);
console.log(`parsed in ${Date.now() - t0} ms`);

console.log("\n== top-level keys ==");
console.log(Object.keys(game).join(", "));

console.log("\n== basic ==");
console.log("date:", game.date, "| player:", game.player, "| dlc:", JSON.stringify(game.save_game)?.slice(0, 120));

const countries = game.countries || {};
const tags = Object.keys(countries);
console.log("countries count:", tags.length);

const playerTag = game.player;
const sample = countries[playerTag] || countries[tags[0]];
console.log(`\n== sample country keys (${playerTag}) ==`);
console.log(Object.keys(sample).join(", "));

// 挑一些关键字段
const want = ["treasury","income","last_income","manpower","max_manpower","sailors","max_sailors","stability","prestige","army_size","land_morale","naval_morale","legitimacy","republican_tradition","mercantilism","army_tradition","navy_tradition","inflation","overextension","corruption","years_of_nationalism","technology","government","monarch","heir","ideas","active_idea_groups","num_of_cities","num_of_ports","loan","debts","great_power_rank","great_power_score","rebel_faction","truce","opinions","subject","name","primary_culture","religion","capital","tech_adm","tech_dip","tech_mil"];
for (const k of want) {
  if (sample[k] !== undefined) {
    let v = sample[k];
    const s = JSON.stringify(v);
    console.log(`  ${k} = ${s.length > 200 ? s.slice(0, 200) + "…" : s}`);
  }
}

console.log("\n== active_wars sample ==");
const wars = game.active_wars || game.wars || [];
const warArr = Array.isArray(wars) ? wars : Object.values(wars);
console.log("wars count:", warArr.length);
if (warArr.length) console.log("war[0] keys:", Object.keys(warArr[0]).join(", "));
if (warArr.length) console.log("war[0]:", JSON.stringify(warArr[0]).slice(0, 800));

console.log("\n== diplomacy sample ==");
const diplo = game.diplomacy || [];
const dArr = Array.isArray(diplo) ? diplo : Object.values(diplo);
console.log("diplomacy entries:", dArr.length);
if (dArr.length) {
  console.log("diplo[0] keys:", Object.keys(dArr[0]).join(", "));
  console.log("diplo[0]:", JSON.stringify(dArr[0]).slice(0, 400));
  const alliance = dArr.find(d => d.alliance);
  if (alliance) console.log("alliance entry:", JSON.stringify(alliance).slice(0, 400));
}

console.log("\n== great powers ==");
for (const t of tags) {
  const c = countries[t];
  if (c && c.great_power_rank !== undefined) console.log(` ${t} rank=${c.great_power_rank}`);
}
