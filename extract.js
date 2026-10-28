// 提取层：从解码后的存档中投影出 AI 决策所需的紧凑视图
import { findTags } from "./tags.js";

const asArray = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const isTag = (s) => typeof s === "string" && /^[A-Z-]{3}$/.test(s);

export function nationTags(save) {
  return Object.keys(save.countries).filter(isTag);
}

// 支持 标签 / 中文名 / 英文名
export function findTag(save, name) {
  const tags = nationTags(save);
  const up = String(name ?? "").toUpperCase();
  if (tags.includes(up)) return up;
  const hits = findTags(name, new Set(tags));
  if (hits.length) return hits[0].tag;
  return null;
}

// 世界概览：列强、玩家、活跃战争、经济霸权
export function overview(save) {
  const gps = save.greatPowers.map(g => ({ rank: g.rank, tag: g.country, score: g.value }));

  // 交叉校验：读到的存档是否真的是本局
  const warnings = [];
  const cp = save.campaign ?? {};
  if (save.pinnedMissing) warnings.push(`锁定的存档 ${cp.save} 不存在，已退回最新档 ${save.file}`);
  if (cp.player && save.playerTag && cp.player !== save.playerTag) {
    warnings.push(`存档里的玩家是 ${save.playerTag}，但战役配置写的是 ${cp.player}——可能读到了旧档；开新档并首次存档后重试，或用 eu4_campaign 锁定存档`);
  }
  if (cp.ai && !save.countries[cp.ai]) {
    warnings.push(`战役配置的 AI 国家 ${cp.ai} 不在本存档中`);
  }
  const wars = save.wars.map(w => summarizeWar(w));
  const topDev = nationTags(save)
    .map(t => ({ tag: t, dev: save.countries[t]?.capped_development ?? 0 }))
    .sort((a, b) => b.dev - a.dev)
    .slice(0, 15);
  return {
    save: save.file,
    format: save.format,
    date: save.date,
    player: save.playerTag,
    campaign: save.campaign,
    ...(save.pinnedMissing ? { pinned_missing: true } : {}),
    ...(warnings.length ? { warnings } : {}),
    current_age: save.currentAge,
    great_powers: gps,
    economic_hegemon: save.economicHegemon,
    revolution_target: save.revolution?.revolution_target ?? null,
    active_wars: wars,
    top_nations_by_dev: topDev,
  };
}

// 战争摘要：从 history 的 add_attacker/add_defender 事件推导阵营
export function summarizeWar(w) {
  const { attackers, defenders } = warSides(w);
  return {
    start: firstDate(w.history),
    original_attacker: w.original_attacker,
    original_defender: w.original_defender,
    attackers,
    defenders,
    participants: asArray(w.participants).map(p => ({ tag: p.tag, war_score: p.war_score })),
    is_coalition: w.is_coalition === true,
  };
}

// 遍历历史事件累积攻防双方
export function warSides(w) {
  const attackers = new Set(), defenders = new Set();
  const hist = w.history ?? {};
  const dates = Object.keys(hist).filter(k => /^\d{3,4}\./.test(k)).sort();
  for (const d of dates) {
    for (const ev of asArray(hist[d])) {
      for (const t of asArray(ev.add_attacker)) if (isTag(t)) attackers.add(t);
      for (const t of asArray(ev.add_defender)) if (isTag(t)) defenders.add(t);
      for (const t of asArray(ev.rem_attacker)) attackers.delete(t);
      for (const t of asArray(ev.rem_defender)) defenders.delete(t);
    }
  }
  return { attackers: [...attackers], defenders: [...defenders] };
}

function firstDate(history) {
  if (!history || typeof history !== "object") return undefined;
  const ds = Object.keys(history).filter(k => /^\d{3,4}\./.test(k)).sort();
  return ds[0];
}

// 单国详情（AI 决策主数据）
export function nation(save, tagName) {
  const tag = findTag(save, tagName);
  if (!tag) throw new Error(`未知国家标签: ${tagName}`);
  const c = save.countries[tag];
  const num = (v) => (typeof v === "number" ? v : undefined);

  const armyCats = c.num_subunits_type_and_cat ?? {};
  const infantry = armyCats.infantry?.normal ?? 0;
  const cavalry = armyCats.cavalry?.normal ?? 0;
  const artillery = armyCats.artillery?.normal ?? 0;
  const military = {
    regiments: infantry + cavalry + artillery,
    infantry, cavalry, artillery,
    ships: {
      heavy: armyCats.heavy_ship?.normal, light: armyCats.light_ship?.normal,
      galley: armyCats.galley?.normal, transport: armyCats.transport?.normal,
    },
    armies: asArray(c.army).length,
    navies: asArray(c.navy).length,
    leaders: asArray(c.leader).length,
    army_tradition: num(c.army_tradition),
    navy_tradition: num(c.navy_tradition),
    army_professionalism: num(c.army_professionalism),
    manpower: num(c.manpower), max_manpower: num(c.max_manpower),
    sailors: num(c.sailors), max_sailors: num(c.max_sailors),
    land_morale: c.land_morale, naval_morale: c.naval_morale,
    forts: c.forts,
  };

  const economy = {
    treasury: num(c.treasury),
    estimated_monthly_income: num(c.estimated_monthly_income),
    income: c.income,
    inflation: num(c.inflation),
    loans: asArray(c.loan).length || undefined,
    estimated_loan: c.estimated_loan,
    land_maintenance: c.land_maintenance,
    naval_maintenance: c.naval_maintenance,
    colonial_maintenance: c.colonial_maintenance,
  };

  const state = {
    government_rank: c.government_rank,
    government: c.government?.government,
    reforms: c.government?.reform_stack?.reforms,
    stability: num(c.stability),
    prestige: num(c.prestige),
    legitimacy: num(c.legitimacy),
    absolutism: num(c.absolutism),
    mercantilism: num(c.mercantilism),
    splendor: num(c.splendor),
    power_projection: c.current_power_projection,
    religious_unity: num(c.religious_unity),
    innovativeness: num(c.innovativeness),
    army_professionalism: num(c.army_professionalism),
    primary_culture: c.primary_culture,
    dominant_culture: c.dominant_culture,
    religion: c.religion,
    capital: c.capital,
    num_of_cities: num(c.num_of_cities),
    num_of_ports: num(c.num_of_ports),
    development: num(c.development ?? c.raw_development),
    realm_development: num(c.realm_development),
    used_governing_capacity: c.used_governing_capacity,
  };

  const tech = {
    adm_tech: c.technology?.adm_tech, dip_tech: c.technology?.dip_tech, mil_tech: c.technology?.mil_tech,
    adm_power: asArray(c.powers)[0], dip_power: asArray(c.powers)[1], mil_power: asArray(c.powers)[2],
    ideas: c.active_idea_groups ?? {},
  };

  // 关系统一视图
  const relations = relationsOf(save, tag);

  // 附属国
  const subjects = (save.diplomacy.dependency ?? [])
    .filter(d => d.first === tag)
    .map(d => ({ tag: d.second, type: d.subject_type }));

  const ai = c.ai ?? {};

  return {
    tag,
    is_player: tag === save.playerTag || c.human === true,
    great_power: c.is_great_power === true,
    neighbors: asArray(c.neighbours).filter(isTag),
    home_neighbors: asArray(c.home_neighbours).filter(isTag),
    friend_tags: asArray(c.friend_tags).filter(isTag),
    rivals: asArray(c.initialized_rivals === true ? c.rivals : undefined).filter(isTag),
    state, economy, military, tech,
    relations,
    subjects,
    ai_personality: ai.personality,
    is_revolution_target: save.revolution?.revolution_target === tag,
  };
}

// 某国的全部外交关系：同盟/联姻/附属/保证/CB/军事通行/交战
export function relationsOf(save, tagName) {
  const tag = findTag(save, tagName);
  if (!tag) throw new Error(`未知国家标签: ${tagName}`);
  const byType = {};
  for (const [type, list] of Object.entries(save.diplomacy)) {
    const mine = list.filter(d => d.first === tag || d.second === tag);
    if (mine.length) {
      byType[type] = mine.map(d => {
        const other = d.first === tag ? d.second : d.first;
        const dir = d.first === tag ? "out" : "in";
        return { other, dir, ...compactDiplo(d) };
      });
    }
  }
  // 好感度（active_relations）
  const ar = save.countries[tag]?.active_relations ?? {};
  const opinions = {};
  for (const [other, rel] of Object.entries(ar)) {
    if (!isTag(other)) continue;
    const sum = rel.cached_sum ?? rel.opinion?.reduce((a, o) => a + (o.current_opinion ?? 0), 0);
    if (typeof sum === "number") opinions[other] = { opinion: Math.round(sum * 100) / 100 };
  }
  return { diplomacy: byType, opinions };
}

function compactDiplo(d) {
  const keep = {};
  for (const k of ["subject_type", "start_date", "end_date", "expiry_date", "progress", "takes_diplo_slot", "enforce_peace"]) {
    if (d[k] !== undefined && typeof d[k] !== "object") keep[k] = d[k];
  }
  return keep;
}

// 与某国相关的战争（含战分与损失）
export function warsOf(save, tagName) {
  const tag = findTag(save, tagName);
  return save.wars
    .filter(w => asArray(w.participants).some(p => p.tag === tag))
    .map(w => {
      const me = asArray(w.participants).find(p => p.tag === tag);
      const { attackers, defenders } = warSides(w);
      const mySide = attackers.includes(tag) ? "attacker" : defenders.includes(tag) ? "defender" : undefined;
      return {
        start: firstDate(w.history),
        my_side: mySide,
        original_attacker: w.original_attacker,
        original_defender: w.original_defender,
        my_war_score: me?.war_score,
        my_losses: me?.losses,
        attackers, defenders,
        participants: asArray(w.participants).map(p => ({ tag: p.tag, war_score: p.war_score })),
        recent_battles: recentBattles(w.history),
      };
    });
}

// 最近 5 场战斗
function recentBattles(history) {
  if (!history || typeof history !== "object") return [];
  const out = [];
  for (const [date, events] of Object.entries(history)) {
    if (!/^\d{3,4}\./.test(date)) continue;
    for (const ev of asArray(events)) {
      if (ev.battle) {
        const b = ev.battle;
        out.push({
          date, location: b.location,
          attacker: b.attacker?.country, defender: b.defender?.country,
          attacker_losses: b.attacker?.losses, defender_losses: b.defender?.losses,
        });
      }
    }
  }
  return out.slice(-5);
}
