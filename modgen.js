// 伴生模组生成器：生成按战役定制的"命令桥"模组
// 原理：控制台 set_global_flag <动词开关> + event aib.<n> <目标国>，
// 事件以目标国为 scope 触发，效果作用到硬编码的 AI 国家（不切 tag、不动存档）。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EU4_DIR, loadSave } from "./save.js";

const MOD_NAME = "eu4_ai_bridge";        // 目录/文件名保持 ASCII，避免启动器路径问题
const MOD_DISPLAY_NAME = "AI 君主桥";     // 启动器显示名，UTF-8 无 BOM（与本机中文 mod 一致）
const MOD_VERSION = "v0.1.1";
const MOD_DIR = path.join(EU4_DIR, "mod", MOD_NAME);

// 动词 -> (全局旗标, 事件号, 说明)
export const VERBS = {
  war: { flag: "aib_go_war", event: 10, desc: "向目标宣战（cb_conquest）" },
  alliance: { flag: "aib_go_alliance", event: 11, desc: "与目标结盟" },
  break_alliance: { flag: "aib_go_break", event: 12, desc: "与目标废除盟约" },
  royal_marriage: { flag: "aib_go_marriage", event: 13, desc: "与目标王室联姻" },
  improve: { flag: "aib_go_improve", event: 14, desc: "改善与目标的关系(+50 好感)" },
  insult: { flag: "aib_go_insult", event: 15, desc: "羞辱目标(-50 好感)" },
  gift: { flag: "aib_go_gift", event: 16, desc: "向目标转账 500 金(转移国库)" },
  boost: { flag: "aib_go_boost", event: 17, desc: "给 AI 国发放人力/水手/三种点数" },
  stab: { flag: "aib_go_stab", event: 18, desc: "AI 国稳定+1 威望+10" },
  trust: { flag: "aib_go_trust", event: 19, desc: "AI 国对目标信任+10" },
};

// 外置 .mod（mod/ 目录下）需要 path 指向模组目录；本机其它本地 mod 用的都是绝对路径+正斜杠
const DESCRIPTOR = (ver, withPath = true) =>
  `name="${MOD_DISPLAY_NAME}"
version="${ver}"
tags={
	"Utilities"
	"Historical"
}
supported_version="1.37.*"
` + (withPath ? `path="${MOD_DIR.replace(/\\/g, "/")}"` : "");

const EVENTS = (aiTag) => `namespace = aib

# AI 命令桥：控制台 set_global_flag <开关> + event aib.<n> <目标TAG>
# 事件以目标国为 scope（ROOT=目标），效果作用到 AI 国家 ${aiTag}（硬编码）。
# 每个事件执行后清除开关旗标。

# 宣战：AI 国 ${aiTag} 对 event 目标国开战
country_event = {
	id = aib.10
	hidden = yes
	is_triggered_only = yes
	immediate = {
		hidden_effect = {
			if = { limit = { has_global_flag = aib_go_war }
				${aiTag} = { declare_war_on = { target = PREV type = cb_conquest } }
				clr_global_flag = aib_go_war
			}
		}
	}
}

# 结盟
country_event = {
	id = aib.11
	hidden = yes
	is_triggered_only = yes
	immediate = {
		hidden_effect = {
			if = { limit = { has_global_flag = aib_go_alliance }
				${aiTag} = { create_alliance = PREV }
				clr_global_flag = aib_go_alliance
			}
		}
	}
}

# 废除盟约
country_event = {
	id = aib.12
	hidden = yes
	is_triggered_only = yes
	immediate = {
		hidden_effect = {
			if = { limit = { has_global_flag = aib_go_break }
				${aiTag} = { break_alliance = PREV }
				clr_global_flag = aib_go_break
			}
		}
	}
}

# 王室联姻
country_event = {
	id = aib.13
	hidden = yes
	is_triggered_only = yes
	immediate = {
		hidden_effect = {
			if = { limit = { has_global_flag = aib_go_marriage }
				${aiTag} = { royal_marriage = PREV }
				clr_global_flag = aib_go_marriage
			}
		}
	}
}

# 改善关系（双向 +50 好感）
country_event = {
	id = aib.14
	hidden = yes
	is_triggered_only = yes
	immediate = {
		hidden_effect = {
			if = { limit = { has_global_flag = aib_go_improve }
				add_opinion = { who = ${aiTag} modifier = aib_improved }
				${aiTag} = { add_opinion = { who = PREV modifier = aib_improved } }
				clr_global_flag = aib_go_improve
			}
		}
	}
}

# 羞辱（双向 -50 好感）
country_event = {
	id = aib.15
	hidden = yes
	is_triggered_only = yes
	immediate = {
		hidden_effect = {
			if = { limit = { has_global_flag = aib_go_insult }
				add_opinion = { who = ${aiTag} modifier = aib_insulted }
				${aiTag} = { add_opinion = { who = PREV modifier = aib_insulted } }
				clr_global_flag = aib_go_insult
			}
		}
	}
}

# 送礼：目标国向 AI 国转 500 金
country_event = {
	id = aib.16
	hidden = yes
	is_triggered_only = yes
	immediate = {
		hidden_effect = {
			if = { limit = { has_global_flag = aib_go_gift }
				${aiTag} = { transfer_treasury = { who = PREV amount = 500 } }
				${aiTag} = { add_opinion = { who = PREV modifier = aib_improved } }
				clr_global_flag = aib_go_gift
			}
		}
	}
}

# 补给：AI 国获得人力/水手/点数
country_event = {
	id = aib.17
	hidden = yes
	is_triggered_only = yes
	immediate = {
		hidden_effect = {
			if = { limit = { has_global_flag = aib_go_boost }
				${aiTag} = {
					add_manpower = 100
					add_sailors = 50
					add_adm_power = 500
					add_dip_power = 500
					add_mil_power = 500
				}
				clr_global_flag = aib_go_boost
			}
		}
	}
}

# 稳定与威望
country_event = {
	id = aib.18
	hidden = yes
	is_triggered_only = yes
	immediate = {
		hidden_effect = {
			if = { limit = { has_global_flag = aib_go_stab }
				${aiTag} = {
					add_stability = 1
					add_prestige = 10
				}
				clr_global_flag = aib_go_stab
			}
		}
	}
}

# 信任
country_event = {
	id = aib.19
	hidden = yes
	is_triggered_only = yes
	immediate = {
		hidden_effect = {
			if = { limit = { has_global_flag = aib_go_trust }
				${aiTag} = { add_trust = { who = PREV value = 10 mutual = yes } }
				clr_global_flag = aib_go_trust
			}
		}
	}
}
`;

const OPINIONS = `aib_improved = {
	opinion = 50
	months = 120
}

aib_insulted = {
	opinion = -50
	months = 60
}
`;

// Paradox 本地化文件必须 UTF-8 BOM
const loc = (pairs) => "\uFEFFl_english:\n" + Object.entries(pairs).map(([k, v]) => ` ${k}:0 "${v}"`).join("\n") + "\n";

export function verbCommand(verb, target) {
  const v = VERBS[verb];
  if (!v) throw new Error(`未知动词: ${verb}；可用: ${Object.keys(VERBS).join(", ")}`);
  const tag = String(target ?? "").toUpperCase();
  if (!/^[A-Z-]{3}$/.test(tag)) throw new Error(`目标国标签无效: ${target}`);
  return [`set_global_flag ${v.flag}`, `event aib.${v.event} ${tag}`];
}

export async function generateMod(aiTag) {
  const tag = String(aiTag).toUpperCase();
  const save = await loadSave();
  if (!save.countries[tag]) throw new Error(`存档中不存在国家标签 ${tag}`);
  fs.mkdirSync(path.join(MOD_DIR, "events"), { recursive: true });
  fs.mkdirSync(path.join(MOD_DIR, "common", "opinion_modifiers"), { recursive: true });
  fs.mkdirSync(path.join(MOD_DIR, "localisation"), { recursive: true });

  fs.writeFileSync(path.join(EU4_DIR, "mod", `${MOD_NAME}.mod`), DESCRIPTOR(MOD_VERSION, true), "utf8");
  fs.writeFileSync(path.join(MOD_DIR, "descriptor.mod"), DESCRIPTOR(MOD_VERSION, false), "utf8");
  fs.writeFileSync(path.join(MOD_DIR, "events", "aib_events.txt"), EVENTS(tag), "utf8");
  fs.writeFileSync(path.join(MOD_DIR, "common", "opinion_modifiers", "aib_opinions.txt"), OPINIONS, "utf8");
  fs.writeFileSync(path.join(MOD_DIR, "localisation", "aib_l_english.yml"),
    loc({ "aib.10.t": "AI Bridge", "aib.10.d": "AI Bridge action", "aib.11.t": "AI Bridge", "aib.11.d": "AI Bridge action" }), "utf8");
  fs.writeFileSync(path.join(MOD_DIR, "localisation", "aib_l_simp_chinese.yml"),
    loc({ "aib.10_t": "AI 指令桥", "aib.10_d": "AI 桥接指令", "aib.11_t": "AI 指令桥", "aib.11_d": "AI 桥接指令" }), "utf8");

  // 项目内留一份存档副本（方便重装）
  const projCopy = path.join(path.dirname(fileURLToPath(import.meta.url)), "mod-template", MOD_NAME);
  fs.mkdirSync(path.join(projCopy, "events"), { recursive: true });
  fs.writeFileSync(path.join(projCopy, "descriptor.mod"), DESCRIPTOR(MOD_VERSION, false), "utf8");
  fs.writeFileSync(path.join(projCopy, "events", "aib_events.txt"), EVENTS(tag), "utf8");

  return {
    mod: MOD_NAME,
    display_name: MOD_DISPLAY_NAME,
    aiTag: tag,
    installed: path.join(MOD_DIR),
    files: ["descriptor.mod", "events/aib_events.txt", "common/opinion_modifiers/aib_opinions.txt", "localisation/*"],
    activate_hint: `启动器中启用 "${MOD_DISPLAY_NAME}"（playset 里勾选），事件绑定 AI 国 = ${tag}`,
    verbs: Object.fromEntries(Object.entries(VERBS).map(([k, v]) => [k, v.desc])),
  };
}
