# eu4-mcp — 让 AI 接入《欧陆风云4》的 MCP 服务端

AI（ZCode / Claude / 任何 MCP 客户端）可以读取 EU4 存档局势、通过命令桥直接在游戏里执行操作，和你同局共玩：**你操作你的国家，AI 操纵它的国家，全程不切 tag、不读档**。

## 架构

```
┌─ MCP 工具层 (server.js) ──────────────────────────────┐
│  eu4_campaign / eu4_find_tag / eu4_list_saves         │
│  eu4_overview / eu4_nation / eu4_relations / eu4_wars │
│  eu4_act / eu4_verb / eu4_setup_mod / eu4_logs        │
├─ 存档解码层 ────────────────────────────────────────────┤
│  save.js    读取 zip 存档（EU4bin 二进制 + EU4txt 明文）│
│  eu4bin.js  二进制 token 流解码器                      │
│  extract.js 投影：世界概览/国家/外交/战争               │
│  tags.js    标签 ↔ 中文名/英文名                       │
├─ 执行层 ───────────────────────────────────────────────┤
│  act.js    写 run 文件 → 控制台 run 执行               │
│            execute=true 时 PowerShell 激活窗口送按键   │
│  modgen.js 生成 per-campaign 伴生模组（10 个动词事件）  │
└────────────────────────────────────────────────────────┘
```

**原理**：EU4 存档是 zip 容器（`EU4bin` 二进制 gamestate，用 `eu4_tokens.raw` token 表解码）；控制台 `run <文件>` 可批量执行命令；伴生模组把"宣战/结盟/送礼"等控制台做不到的操作做成参数化事件（`set_global_flag <开关>` + `event aib.<n> <目标TAG>`，事件效果作用到硬编码的 AI 国家）。

> 平台：Windows（自动执行依赖 PowerShell SendKeys）。读取存档部分本身跨平台，路径需按需调整。

## 安装

```bash
git clone <this repo> && cd eu4-mcp
npm install          # @modelcontextprotocol/sdk / jomini / zod / adm-zip
```

注册到 MCP 客户端（以 ZCode 的 `~/.zcode/cli/config.json` 为例，注意 Windows 下用正斜杠）：

```json
{
  "mcp": {
    "servers": {
      "eu4-mcp": {
        "type": "stdio",
        "command": "C:/Program Files/nodejs/node.exe",
        "args": ["D:/path/to/eu4-mcp/server.js"],
        "timeoutMs": 60000
      }
    }
  }
}
```

然后告诉 AI 你玩哪国、它玩哪国：`eu4_campaign {player: "KHA", ai: "TIM"}`，再 `eu4_setup_mod {}` 生成伴生模组。

## 启用伴生模组

1. EU4 启动器 → Playset → 勾选 **AI 君主桥** → 重启游戏/重新读档
2. 换 AI 国家：`eu4_setup_mod {tag: "XXX"}` 重新生成（会覆盖模组目录）

## 工具一览

| 工具 | 作用 |
|---|---|
| `eu4_campaign {player?, ai?, save?}` | 本局约定：谁玩哪个国家、锁定哪个存档（`campaign.json`），所有工具自动沿用 |
| `eu4_find_tag {name}` | 中文名/英文名/标签 → 国家标签（**蒙古=KHA，明=MNG，帖木儿=TIM**） |
| `eu4_list_saves` | 列出存档（无锁定时用最新） |
| `eu4_overview` | 世界局势：日期/玩家/列强/战争/霸权/革命目标/本局约定 |
| `eu4_nation {tag}` | 国家全息卡：政体/经济/军队/科技理念/邻国/附庸/AI 性格（tag 可传中文名） |
| `eu4_relations {tag}` | 全部外交关系 + 对各国好感度 |
| `eu4_wars {tag}` | 参与的战争：阵营/战分/损失/最近战斗 |
| `eu4_act {commands, execute?}` | 控制台命令直写 run 文件（可选自动按键） |
| `eu4_verb {verb, target}` | 动词指令：war / alliance / break_alliance / royal_marriage / improve / insult / gift / boost / stab / trust |
| `eu4_setup_mod {tag?}` | （重）生成伴生模组；省略 tag 则用 `eu4_campaign` 记的 ai |
| `eu4_logs` | 尾读 error.log / game.log 验证执行结果 |

## 开新档

```text
eu4_campaign {player: "KHA", ai: "TIM", note: "1444 蒙古 vs 帖木儿"}
eu4_setup_mod {}          # 模组自动按 campaign.ai 重新绑定
```

然后：启动器勾选「AI 君主桥」→ 开新档（非铁人、控制台可用）→ **存一次档**（AI 才有局势可读）→ 暂停时喊 AI。
`campaign.json` 里的 `save` 为 `null` 时自动用最新存档；同时玩两局时把 `save` 设成具体文件名锁定，避免串档。
若读到旧档，`eu4_overview` 会返回 `warnings`（存档玩家 ≠ 战役配置的玩家），提示你还没存新档或锁错了档。

## 一局的玩法

1. 你开一局非铁人单机（控制台可用），告诉 AI 你玩哪国、AI 玩哪国（用 `eu4_campaign` 记住）
2. 每当你暂停（或每年、每战前），喊 AI："看看局势，该你了"
3. AI 调 `eu4_overview` → `eu4_nation <AI国>` → `eu4_relations` → 决策
4. AI 用 `eu4_verb`（宣战/结盟/送礼…）和 `eu4_act`（加钱/加人力等）下令，`execute: true` 自动在游戏里执行
5. AI 国日常由游戏内置 AI 运营，LLM 的指令覆盖其战略——它就是这国的"君主"

## 已知限制

- **国家标签易混**：蒙古是 **KHA**（Mongolia），**MNG 是明朝**（Ming），帖木儿是 TIM；拿不准先用 `eu4_find_tag`
- **中文名无法从本地化解码**：汉化 mod 用 0x10 双字节私有编码（依赖 EU4dll 补丁），脚本读不出中文；`findTags` 用内置常用中文别名表 + 游戏本体英文本地化
- **战争名/将领名乱码**：中文环境的显示文本在二进制存档里是宽字符编码，MCP 输出里显示为乱码（纯外观，标签/数值不受影响）
- **`execute: true` 前提**：EU4 在运行、窗口可聚焦、控制台当前是关闭的；执行序列为 ESC → \` → run → 回车 → \`
- **模组动词需游戏内验证**：`declare_war_on` 的 cb_conquest、`transfer_treasury` 等效果语法在 1.37.5 的实际行为需要开局测一次，报错会出现在 error.log（用 `eu4_logs` 查看）
- 存档日期为推断值（战争历史/账本最新年份），个别二进制日期字段未解码
- 铁人存档无法用（控制台被禁用）

## 开发

```bash
npm install
node test.js        # 全链路功能测试
node smoke-mcp.js   # MCP 协议冒烟测试（握手 + 11 个工具实调）
node probe.js       # 存档结构探测（probe2/3/4 为逆向记录：键结构 / hexdump / 国家块定位）
```

文件说明：

| 文件 | 作用 |
|---|---|
| `eu4bin.js` + `eu4_tokens.raw` | 二进制存档解码器与 token 表（1.37.5；大版本更新后若大量 `__token_xxx` 出现需重提） |
| `save.js` / `extract.js` / `tags.js` | 存档读取与缓存、投影、标签解析 |
| `act.js` / `modgen.js` | 命令桥（run 文件 + 自动按键）、伴生模组生成 |
| `test.js` / `smoke*.js` / `probe*.js` | 回归与逆向脚本，默认读本机最近存档；换机器需按需调整断言里的国家标签 |

`campaign.json` 不在版本库内（`campaign.example.json` 是模板），由 `eu4_campaign` 工具在线写入。

