// 存档加载与解码（带 mtime 缓存）。支持 EU4bin 二进制与 EU4txt 明文两种 gamestate。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";
import { Jomini } from "jomini";
import { decodeBinary, loadTokenTable, tokenTablePath } from "./eu4bin.js";

export const PROJECT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const EU4_DIR = path.join(os.homedir(), "Documents/Paradox Interactive/Europa Universalis IV");
export const SAVE_DIR = path.join(EU4_DIR, "save games");
export const RUN_DIR = path.join(EU4_DIR, "run");
export const LOG_FILE = path.join(EU4_DIR, "logs", "game.log");
export const CAMPAIGN_FILE = path.join(PROJECT_DIR, "campaign.json");

// 战役配置：记谁玩谁 + 锁定存档（避免新旧两档串读）
export function readCampaign() {
  try {
    const c = JSON.parse(fs.readFileSync(CAMPAIGN_FILE, "utf8"));
    return { save: c.save ?? null, player: c.player ?? null, ai: c.ai ?? null, note: c.note ?? null };
  } catch {
    return { save: null, player: null, ai: null, note: null };
  }
}

export function writeCampaign(patch) {
  const next = { ...readCampaign(), ...patch };
  fs.writeFileSync(CAMPAIGN_FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}

const table = loadTokenTable(tokenTablePath());

export function listSaves() {
  if (!fs.existsSync(SAVE_DIR)) return [];
  return fs.readdirSync(SAVE_DIR)
    .filter(f => f.toLowerCase().endsWith(".eu4"))
    .map(f => {
      const st = fs.statSync(path.join(SAVE_DIR, f));
      return { file: f, path: path.join(SAVE_DIR, f), sizeMB: +(st.size / 1e6).toFixed(1), mtime: st.mtime.toISOString() };
    })
    .sort((a, b) => b.mtime.localeCompare(a.mtime));
}

let jominiParser = null;
async function getJomini() {
  if (!jominiParser) jominiParser = await Jomini.initialize();
  return jominiParser;
}

const cache = new Map(); // path+mtime -> save 对象

export async function loadSave(saveName) {
  const campaign = readCampaign();
  const pinned = saveName ?? campaign.save ?? null;
  const saves = listSaves();
  let meta = pinned ? saves.find(s => s.file === pinned || s.path === pinned) : null;
  const pinnedMissing = Boolean(pinned) && !meta;
  if (!meta) meta = saves[0];
  if (!meta) throw new Error(`没有可用存档（目录 ${SAVE_DIR}）；可用: ${saves.map(s => s.file).join(", ") || "无"}`);

  const cacheKey = `${meta.path}|${meta.mtime}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const zip = new AdmZip(meta.path);
  const gs = zip.getEntry("gamestate").getData();
  const magic = gs.subarray(0, 6).toString("latin1");
  let game, format;
  if (magic === "EU4bin") {
    format = "binary";
    game = decodeBinary(gs.subarray(6), table);
  } else {
    format = "text";
    const parser = await getJomini();
    // 跳过 EU4txt 头
    const text = gs.subarray(magic === "EU4txt" ? 6 : 0).toString("utf8");
    game = parser.parseText(text);
  }

  // —— 归一化 ——
  const countries = game.countries ?? {};
  const pc = game.players_countries ?? game.player;
  let playerTag;
  if (pc && typeof pc === "object") playerTag = Object.values(pc).find(v => typeof v === "string" && /^[A-Z]{3}$/.test(v)) ?? Object.values(pc)[1];
  else if (typeof pc === "string") playerTag = pc;

  // 外交归一化：二进制按类型分组；明文为 {type=...} 列表 → 分组
  const diploRaw = game.diplomacy ?? {};
  const diplomacy = {};
  if (Array.isArray(diploRaw)) {
    for (const d of diploRaw) {
      const t = d.type ?? "other";
      (diplomacy[t] ??= []).push(d);
    }
  } else {
    for (const [t, list] of Object.entries(diploRaw)) {
      diplomacy[t] = Array.isArray(list) ? list : [list];
    }
  }

  // 战争归一化（active_war 为带索引键的对象数组）
  let wars = game.active_war ?? game.active_wars ?? [];
  if (!Array.isArray(wars)) wars = Object.values(wars);
  wars = wars.filter(w => w && typeof w === "object");

  // 当前日期：二进制存档的顶层 date 键可能未解析，从多处字符串日期推断
  const date = findSaveDate(game, wars);

  const save = {
    file: meta.file,
    path: meta.path,
    mtime: meta.mtime,
    format,
    playerTag,
    campaign,          // { save, player, ai }：本局约定
    pinnedMissing,     // 锁定的存档不存在时退回最新档
    date,
    countries,
    diplomacy,
    wars,
    greatPowers: game.great_powers?.original ?? [],
    flags: game.flags ?? {},
    economicHegemon: game.economic_hegemon ?? null,
    revolution: game.revolution ?? null,
    currentAge: game.current_age ?? null,
  };

  cache.clear();
  cache.set(cacheKey, save);
  return save;
}

// 从战争历史 / 统计账本推断存档日期（精度到年，月份尽力）
function findSaveDate(game, wars) {
  let best = null;
  const consider = (s) => {
    const m = /^(\d{3,4})\.(\d{1,2})\.(\d{1,2})$/.exec(String(s));
    if (!m) return;
    const d = `${m[1]}.${m[2].padStart(2, "0")}.${m[3].padStart(2, "0")}`;
    if (!best || d > best) best = d;
  };
  // 战争历史的最后事件日期
  for (const w of wars) {
    const hist = w.history ?? {};
    for (const k of Object.keys(hist)) consider(k);
  }
  // 各国 history 最后日期（太慢，跳过）；用统计账本最后年份兜底
  if (!best) {
    const led = game.income_statistics?.ledger_data;
    if (Array.isArray(led)) {
      for (const row of led) {
        const data = row?.data;
        if (Array.isArray(data) && data.length >= 2) {
          const y = data[data.length - 2];
          if (typeof y === "number" && y > 1400 && y < 2000) best = `${y}.01.01`;
        }
      }
    }
  }
  return best;
}
