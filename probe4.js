// 探针 4：定位 neighbours 原始值 + 二进制浮点 token 的真实字节
import AdmZip from "adm-zip";
import { loadTokenTable, tokenTablePath } from "./eu4bin.js";
import os from "node:os";
import path from "node:path";

const savePath = process.argv[2] ||
  path.join(os.homedir(), "Documents/Paradox Interactive/Europa Universalis IV/save games/111.eu4");
const table = loadTokenTable(tokenTablePath());

// 建 name -> id 反查
const nameToId = new Map();
for (const [id, name] of table) if (!nameToId.has(name)) nameToId.set(name, id);

const zip = new AdmZip(savePath);
const gs = zip.getEntry("gamestate").getData();
const body = gs.subarray(6);

// 顺带把 neighbours 解出来（局部解码，避免整树）
import { decodeBinary } from "./eu4bin.js";
const game = decodeBinary(body, table);
const c = game.countries["ICH"];
console.log("neighbours raw:", JSON.stringify(c?.neighbours)?.slice(0, 200));
console.log("home_neighbours raw:", JSON.stringify(c?.home_neighbours)?.slice(0, 120));
console.log("friend_tags raw:", JSON.stringify(c?.friend_tags)?.slice(0, 120));
console.log("rivals raw:", JSON.stringify(c?.rivals)?.slice(0, 120));
console.log("initialized_rivals:", c?.initialized_rivals);
console.log("subject_types raw:", JSON.stringify(c?.subject_types)?.slice(0, 120));
console.log("navy_strength raw:", JSON.stringify(c?.navy_strength));
console.log("army_professionalism raw:", JSON.stringify(c?.army_professionalism));

// 在字节流中定位 key token: u16(id) EQ，然后 hexdump 其后 12 字节
function dumpAfter(keyName, max = 3) {
  const id = nameToId.get(keyName);
  if (id === undefined) return console.log(`no token id for ${keyName}`);
  let found = 0;
  for (let i = 0; i < body.length - 8 && found < max; i++) {
    if (body[i] === (id & 0xff) && body[i + 1] === (id >> 8) && body[i + 2] === 0x01 && body[i + 3] === 0x00) {
      const hex = [...body.subarray(i, i + 16)].map(b => b.toString(16).padStart(2, "0")).join(" ");
      console.log(`${keyName} (id ${id}) @${i}: ${hex}`);
      found++;
      i += 10;
    }
  }
}

console.log("\n== hexdump ==");
dumpAfter("navy_strength", 2);
dumpAfter("army_professionalism", 2);
dumpAfter("total_military_power", 1);
