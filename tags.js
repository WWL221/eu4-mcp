// 国家标签解析：中文别名表 + 官方英文本地化（中文本地化是 0x10 双字节私有编码，无法直接解码）
import fs from "node:fs";
import path from "node:path";

const CANDIDATES = [
  process.env.EU4_INSTALL,
  "D:/yingyong/steam/steamapps/common/Europa Universalis IV",
  "C:/Program Files (x86)/Steam/steamapps/common/Europa Universalis IV",
  "C:/Program Files/Steam/steamapps/common/Europa Universalis IV",
].filter(Boolean);

export function installDir() {
  for (const dir of CANDIDATES) {
    if (fs.existsSync(path.join(dir, "localisation", "countries_l_english.yml"))) return dir;
  }
  return null;
}

let nameCache = null;
// 标签 -> 英文名（取自游戏本体 countries_l_english.yml）
export function tagNames() {
  if (nameCache) return nameCache;
  const map = new Map();
  const dir = installDir();
  if (dir) {
    const text = fs.readFileSync(path.join(dir, "localisation", "countries_l_english.yml"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9]{3}):\d*\s*"([^"]*)"/.exec(line);
      if (m && !map.has(m[1])) map.set(m[1], m[2]);
    }
  }
  nameCache = map;
  return map;
}

// 常用中文名，只覆盖高频国家；完整中文名无法解码
// 注意 MNG = 明朝（Ming），蒙古是 KHA
const CN_ALIASES = {
  蒙古: "KHA", 蒙古汗国: "KHA", 帖木儿: "TIM", 帖木儿帝国: "TIM",
  明: "MNG", 明朝: "MNG", 大明: "MNG", 卫拉特: "OIR", 瓦剌: "OIR", 瓦刺: "OIR",
  喀尔喀: "KLK", 察哈尔: "CHH", 元: "YUA", 大元: "YUA", 满洲: "MCH", 后金: "MCH", 大清: "QNG",
  印加: "ICH", 奥地利: "HAB", 奥斯曼: "TUR", 土耳其: "TUR", 法兰西: "FRA", 法国: "FRA",
  英格兰: "ENG", 大不列颠: "GBR", 英国: "GBR", 西班牙: "SPA", 卡斯蒂利亚: "CAS", 葡萄牙: "POR",
  俄罗斯: "RUS", 莫斯科: "MOS", 波兰: "POL", 立陶宛: "LIT", 波斯: "PER", 德里: "DLH",
  日本: "JAP", 朝鲜: "KOR", 布哈拉: "BUK", 诺盖: "NOG", 金帐: "GLH", 匈牙利: "HUN",
  波希米亚: "BOH", 教宗国: "PAP", 威尼斯: "VEN", 米兰: "MIL", 勃艮第: "BUR", 荷兰: "NED",
};

// 返回候选 [{tag, name, via}]；eligible 传入时只保留存档中存在的标签
export function findTags(query, eligible = null) {
  const q = String(query ?? "").trim();
  if (!q) return [];
  const names = tagNames();
  const out = [];
  const push = (tag, via) => {
    if (!tag || out.some(o => o.tag === tag)) return;
    if (eligible && !eligible.has(tag)) return;
    out.push({ tag, name: names.get(tag) ?? null, via });
  };

  const upper = q.toUpperCase();
  if (/^[A-Z0-9]{3}$/.test(upper)) push(upper, "tag");

  if (CN_ALIASES[q]) push(CN_ALIASES[q], "chinese-alias");

  const lower = q.toLowerCase();
  for (const [tag, name] of names) {
    if (name && name.toLowerCase() === lower) push(tag, "english-name-exact");
  }
  for (const [tag, name] of names) {
    if (name && name.toLowerCase().includes(lower)) push(tag, "english-name-partial");
  }
  return out;
}

export function cnAliasKeys() {
  return Object.keys(CN_ALIASES);
}
