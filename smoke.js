// 冒烟测试：解码真实存档，打印顶层结构与样例
import AdmZip from "adm-zip";
import { decodeBinary, loadTokenTable, tokenTablePath } from "./eu4bin.js";
import os from "node:os";
import path from "node:path";

const savePath = process.argv[2] ||
  path.join(os.homedir(), "Documents/Paradox Interactive/Europa Universalis IV/save games/111.eu4");

const table = loadTokenTable(tokenTablePath());
console.log("token table entries:", table.size);

const t0 = Date.now();
const zip = new AdmZip(savePath);
const gs = zip.getEntry("gamestate").getData();
console.log("gamestate bytes:", gs.length, "| magic:", gs.subarray(0, 6).toString());
const body = gs.subarray(6);

const game = decodeBinary(body, table);
console.log(`decoded in ${(Date.now() - t0) / 1000}s`);
console.log("rss:", (process.memoryUsage().rss / 1e6).toFixed(0), "MB");

const keys = game.__keys || Object.keys(game);
console.log("top-level keys:", keys.length);

const want = ["date", "Player", "player", "start_date", "countries", "active_wars", "diplomacy", "provinces", "map_area_data", "great_powers_file", "systems", "savegame_version"];
for (const k of want) {
  if (game[k] !== undefined) {
    const v = game[k];
    const size = Array.isArray(v) ? `array(${v.length})` : typeof v + (v && typeof v === "object" ? `(${Object.keys(v).length})` : `=${v}`);
    console.log(`  ${k}: ${size}`);
  }
}

const countries = game.countries || {};
const tags = Object.keys(countries).filter(t => !t.startsWith("__"));
console.log("country tags:", tags.length, "sample:", tags.slice(0, 12).join(","));

const player = game.Player || game.player;
console.log("Player:", player);

const ich = countries[player] || countries[tags[0]];
const ckeys = ich.__keys || Object.keys(ich);
console.log(`\ncountry ${player} keys (${ckeys.length}):`, ckeys.join(","));
