#!/usr/bin/env node
// eu4-mcp: 让 AI 接入《欧陆风云4》的 MCP 服务端
// 读存档（世界/国家/外交/战争）+ 命令桥（run 文件 + 控制台自动执行）
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { listSaves, loadSave, readCampaign, writeCampaign } from "./save.js";
import { overview, nation, relationsOf, warsOf, nationTags } from "./extract.js";
import { findTags } from "./tags.js";
import { writeRunFile, executeInGame, tailLogs } from "./act.js";
import { generateMod, verbCommand, VERBS } from "./modgen.js";

const server = new McpServer({ name: "eu4-mcp", version: "0.1.0" });

const json = (data) => ({ content: [{ type: "text", text: JSON.stringify(data, null, 1) }] });

// 大对象瘦身：_countries 全量太大，工具内按需投影
server.registerTool("eu4_campaign", {
  title: "EU4 战役配置",
  description: "读取或设置本局约定：谁玩哪个国家（player/ai 标签）、锁定哪个存档。开新档时先调它记下双方国家，之后所有工具自动沿用（ai 标签也用于模组绑定）。save=null 表示自动用最新存档。",
  inputSchema: {
    player: z.string().optional().describe("玩家国家标签，如 MNG"),
    ai: z.string().optional().describe("AI 操纵的国家标签，如 TIM"),
    save: z.string().nullable().optional().describe("锁定存档文件名；传 null 取消锁定（用最新存档）"),
    note: z.string().optional().describe("备注，如 '1444 蒙古 vs 帖木儿'"),
  },
}, async ({ player, ai, save, note }) => {
  const patch = {};
  if (player !== undefined) patch.player = player ? player.toUpperCase() : null;
  if (ai !== undefined) patch.ai = ai ? ai.toUpperCase() : null;
  if (save !== undefined) patch.save = save;
  if (note !== undefined) patch.note = note;
  const campaign = Object.keys(patch).length ? writeCampaign(patch) : readCampaign();
  return json({ campaign, saves: listSaves().map(s => s.file) });
});

server.registerTool("eu4_find_tag", {
  title: "EU4 查找国家标签",
  description: "把中文名/英文名/标签解析成国家标签。注意易混：蒙古=KHA，明= MNG；帖木儿=TIM。exact=false 时做模糊匹配。",
  inputSchema: {
    name: z.string().describe("中文名（常用国名）、英文名或三字标签"),
    alive_only: z.boolean().optional().describe("只返回当前存档里存在的国家，默认 true"),
  },
}, async ({ name, alive_only }) => {
  const save = await loadSave();
  const eligible = alive_only === false ? null : new Set(nationTags(save));
  const hits = findTags(name, eligible);
  return json({ query: name, save: save.file, candidates: hits.slice(0, 20) });
});

server.registerTool("eu4_list_saves", {
  title: "EU4 存档列表",
  description: "列出 EU4 存档目录中的存档文件（按修改时间排序，默认使用最新）",
  inputSchema: {},
}, async () => json(listSaves()));

server.registerTool("eu4_overview", {
  title: "EU4 世界概览",
  description: "当前存档的世界局势：日期、玩家国、列强排名、活跃战争（攻防双方+战分）、经济霸权、革命目标、发展度前15国家",
  inputSchema: { save: z.string().optional().describe("存档文件名，默认最新") },
}, async ({ save }) => json(overview(await loadSave(save))));

server.registerTool("eu4_nation", {
  title: "EU4 国家详情",
  description: "单个国家的完整决策数据：政体/稳定/威望、经济（国库/月收入/通胀）、军队（兵种构成/将领/人力）、科技与理念、邻国、附属国、AI 性格",
  inputSchema: {
    tag: z.string().describe("国家三字标签，如 ICH、FRA"),
    save: z.string().optional().describe("存档文件名，默认最新"),
  },
}, async ({ tag, save }) => json(nation(await loadSave(save), tag)));

server.registerTool("eu4_relations", {
  title: "EU4 外交关系",
  description: "某国的全部外交关系：同盟/王室联姻/军事通行/保证独立/附庸/宣战理由/改善关系使节，以及与各国的好感度",
  inputSchema: {
    tag: z.string().describe("国家三字标签"),
    save: z.string().optional(),
  },
}, async ({ tag, save }) => json(relationsOf(await loadSave(save), tag)));

server.registerTool("eu4_wars", {
  title: "EU4 战争详情",
  description: "某国参与的战争：我方阵营、战分、损失、双方全部参战方、最近 5 场战斗（地点/双方/损失）",
  inputSchema: {
    tag: z.string().describe("国家三字标签"),
    save: z.string().optional(),
  },
}, async ({ tag, save }) => json(warsOf(await loadSave(save), tag)));

server.registerTool("eu4_act", {
  title: "EU4 下达指令",
  description: "把控制台命令写入 EU4 的 run 文件（游戏内按 ` 打开控制台输入 run <name> 执行），可选择自动向 EU4 窗口发送按键执行。命令在当前玩家标签下生效；如需作用于 AI 国家，请配合伴生模组的桥接事件（set_global_flag + event）。",
  inputSchema: {
    commands: z.array(z.string()).describe("控制台命令列表，按顺序执行"),
    name: z.string().optional().describe("run 文件名（不含扩展名），默认 ai_turn"),
    execute: z.boolean().optional().describe("true=自动激活 EU4 窗口并发送按键执行；false=只写文件"),
  },
}, async ({ commands, name, execute }) => {
  const written = writeRunFile(commands, name);
  if (!execute) {
    return json({ ...written, executed: false, hint: `已在游戏内执行：按 \` 打开控制台，输入 run ${name ?? "ai_turn"} 回车` });
  }
  try {
    const r = await executeInGame(name ?? "ai_turn");
    return json({ ...written, executed: true, ...r });
  } catch (e) {
    return json({ ...written, executed: false, error: String(e.message ?? e) });
  }
});

server.registerTool("eu4_logs", {
  title: "EU4 日志",
  description: "尾读 EU4 的 error.log 与 game.log，检查 run 文件命令是否报错",
  inputSchema: { lines: z.number().optional().describe("每个日志尾读行数，默认 30") },
}, async ({ lines }) => json(tailLogs(lines ?? 30)));

server.registerTool("eu4_setup_mod", {
  title: "EU4 安装伴生模组",
  description: "生成并安装 per-campaign 的「AI 君主桥」伴生模组到 Documents mod 目录（硬编码 AI 国家标签），提供宣战/结盟/送礼等 10 个动词事件。生成后需在启动器 playset 中启用该模组并重开存档。",
  inputSchema: { tag: z.string().optional().describe("AI 操纵的国家三字标签，如 TIM；省略则用 eu4_campaign 里记录的 ai") },
}, async ({ tag }) => {
  const target = tag ?? readCampaign().ai;
  if (!target) throw new Error("未指定 AI 国家：传 tag，或先用 eu4_campaign 设置 ai");
  const r = await generateMod(target);
  writeCampaign({ ai: r.aiTag });
  return json(r);
});

server.registerTool("eu4_verb", {
  title: "EU4 动词指令",
  description: `通过伴生模组对 AI 国家下达动词指令（不切换国家）。动词: ${Object.keys(VERBS).join(", ")}。生成 run 文件（set_global_flag + event），execute=true 时自动送键执行。`,
  inputSchema: {
    verb: z.enum(Object.keys(VERBS)).describe("动词"),
    target: z.string().describe("动词作用的目标国标签（如结盟/宣战对象）"),
    name: z.string().optional().describe("run 文件名，默认 ai_turn"),
    execute: z.boolean().optional().describe("true=自动激活 EU4 窗口发送按键"),
  },
}, async ({ verb, target, name, execute }) => {
  const commands = verbCommand(verb, target);
  const written = writeRunFile(commands, name ?? "ai_turn");
  if (!execute) {
    return json({ ...written, verb, target, executed: false, hint: `游戏内按 \` 打开控制台输入 run ${name ?? "ai_turn"} 回车；或下次 execute=true 自动执行` });
  }
  try {
    const r = await executeInGame(name ?? "ai_turn");
    return json({ ...written, verb, target, executed: true, ...r });
  } catch (e) {
    return json({ ...written, verb, target, executed: false, error: String(e.message ?? e) });
  }
});

await server.connect(new StdioServerTransport());
console.error("[eu4-mcp] ready"); // stderr 不污染 stdio 协议
