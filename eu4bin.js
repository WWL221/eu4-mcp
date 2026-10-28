// EU4 二进制存档解码器 —— 移植自 D:/ai/_eu4_edit/eu4bin.py（7月实战验证版）
// 格式: 每个 token = u16 LE 类型 id + payload；未识别的类型 id 即为 key（查 token 表）
// f32 token 的 payload 是 i32 定点数 / 1000
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EQUAL = 0x0001, OPEN = 0x0003, CLOSE = 0x0004;
const TYPE_U32 = 0x0014, TYPE_I32 = 0x000c, TYPE_F32 = 0x000d;
const TYPE_U64 = 0x029c, TYPE_I64 = 0x0317, TYPE_F64 = 0x0167;
const TYPE_BOOL = 0x000e, TYPE_QUOTED = 0x000f, TYPE_UNQUOTED = 0x0017;
const TYPE_EMPTY_STRING = 0x0d42;
const TYPE_LOOKUP_U16 = 0x0d3e, TYPE_LOOKUP_U32 = 0x0d3f, TYPE_LOOKUP_U8 = 0x0d40,
  TYPE_LOOKUP_U24 = 0x0d41, TYPE_LOOKUP_U8_ALT = 0x0d43, TYPE_LOOKUP_U16_ALT = 0x0d44,
  TYPE_LOOKUP_U24_ALT = 0x0d45, TYPE_LOOKUP_U32_ALT = 0x0d46;
const TYPE_FIXED5_ZERO = 0x0d47, TYPE_FIXED5_I56 = 0x0d55;
const TYPE_RGB = 0x0243;
const FIXED5_SIZES = { 0x0d48: 1, 0x0d49: 2, 0x0d4a: 3, 0x0d4b: 4, 0x0d4c: 5, 0x0d4d: 6, 0x0d4e: 7, 0x0d4f: 1, 0x0d50: 2, 0x0d51: 3, 0x0d52: 4, 0x0d53: 5, 0x0d54: 6, 0x0d55: 7 };

export function loadTokenTable(file) {
  const raw = fs.readFileSync(file);
  const bp = raw.readUInt16LE(2);
  let pos = 4;
  const table = new Map();
  let i = 0;
  while (pos < raw.length) {
    const ln = raw[pos++];
    const name = raw.subarray(pos, pos + ln).toString("utf8");
    pos += ln;
    table.set(i < bp ? i : 10000 + (i - bp), name);
    i++;
  }
  return table;
}

export function tokenTablePath() {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "eu4_tokens.raw");
}

const EQ = { e: "eq" }, OP = { e: "op" }, CL = { e: "cl" };

class TokenStream {
  constructor(data) { this.d = data; this.pos = 0; this.buf = null; }
  u16() { const v = this.d.readUInt16LE(this.pos); this.pos += 2; return v; }
  read() {
    if (this.buf) { const t = this.buf; this.buf = null; return t; }
    return this._next();
  }
  _next() {
    if (this.pos >= this.d.length) return null;
    const tid = this.u16();
    switch (tid) {
      case EQUAL: return EQ;
      case OPEN: return OP;
      case CLOSE: return CL;
      case TYPE_I32: { const v = this.d.readInt32LE(this.pos); this.pos += 4; return { e: "v", v }; }
      case TYPE_U32: { const v = this.d.readUInt32LE(this.pos); this.pos += 4; return { e: "v", v }; }
      case TYPE_F32: { const v = this.d.readInt32LE(this.pos) / 1000; this.pos += 4; return { e: "v", v }; }
      case TYPE_I64: { const v = Number(this.d.readBigInt64LE(this.pos)); this.pos += 8; return { e: "v", v }; }
      case TYPE_U64: { const v = Number(this.d.readBigUInt64LE(this.pos)); this.pos += 8; return { e: "v", v }; }
      case TYPE_F64: { const v = this.d.readDoubleLE(this.pos); this.pos += 8; return { e: "v", v: Math.abs(v) < 1e-300 ? 0 : v }; }
      case TYPE_BOOL: { const v = this.d[this.pos] !== 0; this.pos += 1; return { e: "v", v }; }
      case TYPE_QUOTED:
      case TYPE_UNQUOTED: {
        const ln = this.u16();
        const s = this.d.subarray(this.pos, this.pos + ln).toString("utf8");
        this.pos += ln;
        return { e: "s", v: s };
      }
      case TYPE_EMPTY_STRING: return { e: "s", v: "" };
      case TYPE_LOOKUP_U8:
      case TYPE_LOOKUP_U8_ALT: { const v = this.d[this.pos]; this.pos += 1; return { e: "v", v: { $lookup: v } }; }
      case TYPE_LOOKUP_U16:
      case TYPE_LOOKUP_U16_ALT: { const v = this.u16(); return { e: "v", v: { $lookup: v } }; }
      case TYPE_LOOKUP_U24:
      case TYPE_LOOKUP_U24_ALT: {
        const v = this.d[this.pos] | (this.d[this.pos + 1] << 8) | (this.d[this.pos + 2] << 16);
        this.pos += 3;
        return { e: "v", v: { $lookup: v } };
      }
      case TYPE_LOOKUP_U32:
      case TYPE_LOOKUP_U32_ALT: { const v = this.d.readUInt32LE(this.pos); this.pos += 4; return { e: "v", v: { $lookup: v } }; }
      case TYPE_RGB: {
        const n = (this.d[this.pos] === 0 && this.d[this.pos + 1] === 0) ? 4 : 3;
        const v = [...this.d.subarray(this.pos, this.pos + n)];
        this.pos += n;
        return { e: "v", v: { $rgb: v } };
      }
      default: {
        if (tid >= TYPE_FIXED5_ZERO && tid <= TYPE_FIXED5_I56) {
          const sz = FIXED5_SIZES[tid];
          let v = 0;
          for (let i = 0; i < sz; i++) v |= this.d[this.pos + i] << (8 * i);
          this.pos += sz;
          if (tid >= 0x0d4f) v = -v;
          return { e: "v", v: v / 100000 };
        }
        return { e: "id", v: tid };
      }
    }
  }
}

// 解析 token 流。对象容器用「带 __keys 的数组」承载（key 是 expando 属性，可重复合并成 __multi 数组）。
// 关键判定：pendingKey 为空时的 s/id token 是 key 还是裸列表元素——偷看下一个 token，
// 是 EQ/OP 则为 key，否则为裸元素（如 neighbours={ FRA GBR } 的标签列表）。
export function decodeBinary(body, table) {
  const root = [];
  root.__keys = [];
  const stack = [root];
  let pendingKey = null;
  const nameOf = (id) => table.get(id) ?? `__token_${id.toString(16)}`;

  const ts = new TokenStream(body);
  let lookahead = null;
  // next 必须先消费 lookahead，否则偷看的 token 会被流读取跳过（陈旧前瞻 bug）
  const next = () => { const t = lookahead; lookahead = null; return t ?? ts.read(); };
  const peek = () => lookahead ?? (lookahead = ts.read());
  const take = () => next();

  const handleValue = (tok) => {
    const cur = stack[stack.length - 1];
    if (tok === OP) {
      const c = [];
      c.__keys = [];
      if (pendingKey !== null) { attach(cur, pendingKey, c); pendingKey = null; }
      else cur.push(c);
      stack.push(c);
    } else if (tok === CL) {
      stack.pop();
    } else if (tok === EQ) {
      // no-op：pendingKey 已就位，等值
    } else if (pendingKey !== null) {
      const v = tok.e === "id" ? nameOf(tok.v) : tok.v;
      attach(cur, pendingKey, v);
      pendingKey = null;
    } else if (tok.e === "s" || tok.e === "id") {
      const nt = peek();
      if (nt === EQ || nt === OP) {
        pendingKey = tok.e === "id" ? nameOf(tok.v) : tok.v;
        if (nt === OP) { take(); handleValue(OP); } // key = { } 空 / key = { ... }
      } else {
        cur.push(tok.e === "id" ? nameOf(tok.v) : tok.v); // 裸列表元素
      }
    } else {
      cur.push(tok.v); // 无 key 的裸值
    }
  };

  for (let tok = next(); tok !== null; tok = next()) {
    handleValue(tok);
  }
  return finalize(root);
}

function attach(container, key, value) {
  const existing = container[key];
  if (existing === undefined) {
    container[key] = value;
    container.__keys.push(key);
  } else if (existing && existing.__multi === true) {
    existing.push(value);
  } else {
    const arr = [existing, value];
    arr.__multi = true;
    container[key] = arr;
  }
}

// 转成最终形态：有 key 的容器→对象；无 key 的→纯数组
function finalize(entries) {
  if (!Array.isArray(entries)) return entries;
  if (entries.__keys && entries.__keys.length > 0) {
    const out = {};
    for (const k of entries.__keys) {
      const v = entries[k];
      if (Array.isArray(v) && v.__multi === true) {
        out[k] = v.map(finalize);
      } else {
        out[k] = finalize(v);
      }
    }
    return out;
  }
  return entries.map(finalize);
}
