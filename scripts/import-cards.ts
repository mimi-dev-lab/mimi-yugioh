import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// Supabase 本地连接
const supabase = createClient(
  "http://127.0.0.1:54321",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
);

interface RawCard {
  id: number;
  name: string;
  name_cn?: string;
  name_jp?: string;
  type: string;
  desc: string;
  desc_cn?: string;
  desc_jp?: string;
  atk?: number | null;
  def?: number | null;
  level?: number | null;
  race?: string;
  attribute?: string | null;
}

interface DbCard {
  id: number;
  name_en: string;
  name_cn: string | null;
  name_jp: string | null;
  card_type: string;
  sub_type: string | null;
  attribute: string | null;
  race: string | null;
  level: number | null;
  atk: number | null;
  def: number | null;
  desc_en: string;
  desc_cn: string | null;
  desc_jp: string | null;
  archetype: string | null;
}

// 解析卡片类型
function parseCardType(type: string): { card_type: string; sub_type: string | null } {
  const typeLower = type.toLowerCase();
  
  // 魔法卡
  if (typeLower.includes("spell")) {
    return { card_type: "Spell", sub_type: type.replace(/spell card/i, "").trim() || null };
  }
  
  // 陷阱卡
  if (typeLower.includes("trap")) {
    return { card_type: "Trap", sub_type: type.replace(/trap card/i, "").trim() || null };
  }
  
  // 怪兽卡 - 提取子类型
  let sub_type: string | null = null;
  const subTypes: string[] = [];
  
  if (typeLower.includes("fusion")) subTypes.push("Fusion");
  if (typeLower.includes("synchro")) subTypes.push("Synchro");
  if (typeLower.includes("xyz")) subTypes.push("Xyz");
  if (typeLower.includes("link")) subTypes.push("Link");
  if (typeLower.includes("ritual")) subTypes.push("Ritual");
  if (typeLower.includes("pendulum")) subTypes.push("Pendulum");
  if (typeLower.includes("tuner")) subTypes.push("Tuner");
  if (typeLower.includes("effect")) subTypes.push("Effect");
  if (typeLower.includes("normal") && !typeLower.includes("effect")) subTypes.push("Normal");
  if (typeLower.includes("flip")) subTypes.push("Flip");
  if (typeLower.includes("spirit")) subTypes.push("Spirit");
  if (typeLower.includes("union")) subTypes.push("Union");
  if (typeLower.includes("gemini")) subTypes.push("Gemini");
  if (typeLower.includes("toon")) subTypes.push("Toon");
  
  sub_type = subTypes.length > 0 ? subTypes.join("/") : null;
  
  return { card_type: "Monster", sub_type };
}

// 转换卡片数据
function transformCard(raw: RawCard): DbCard {
  const { card_type, sub_type } = parseCardType(raw.type);
  
  return {
    id: raw.id,
    name_en: raw.name,
    name_cn: raw.name_cn || null,
    name_jp: raw.name_jp || null,
    card_type,
    sub_type,
    attribute: raw.attribute || null,
    race: raw.race || null,
    level: raw.level || null,
    atk: raw.atk ?? null,
    def: raw.def ?? null,
    desc_en: raw.desc,
    desc_cn: raw.desc_cn || null,
    desc_jp: raw.desc_jp || null,
    archetype: null, // TODO: 可以从卡名推断
  };
}

async function importCards() {
  console.log("🚀 开始导入卡片数据...\n");
  
  // 读取 JSON 文件
  const jsonPath = path.join(__dirname, "../../yugioh_cards/yugioh_cards_data.json");
  console.log(`📂 读取文件: ${jsonPath}`);
  
  const rawData = fs.readFileSync(jsonPath, "utf-8");
  const cards: RawCard[] = JSON.parse(rawData);
  
  console.log(`📊 总卡片数: ${cards.length}\n`);
  
  // 转换数据
  const dbCards = cards.map(transformCard);
  
  // 统计
  const stats = {
    monster: dbCards.filter(c => c.card_type === "Monster").length,
    spell: dbCards.filter(c => c.card_type === "Spell").length,
    trap: dbCards.filter(c => c.card_type === "Trap").length,
    withDescJp: dbCards.filter(c => c.desc_jp).length,
  };
  
  console.log("📈 统计:");
  console.log(`   怪兽卡: ${stats.monster}`);
  console.log(`   魔法卡: ${stats.spell}`);
  console.log(`   陷阱卡: ${stats.trap}`);
  console.log(`   有日文效果: ${stats.withDescJp}\n`);
  
  // 批量插入 (每批 500 条)
  const batchSize = 500;
  let inserted = 0;
  let errors = 0;
  
  for (let i = 0; i < dbCards.length; i += batchSize) {
    const batch = dbCards.slice(i, i + batchSize);
    
    const { error } = await supabase
      .from("cards")
      .upsert(batch, { onConflict: "id" });
    
    if (error) {
      console.error(`❌ 批次 ${Math.floor(i / batchSize) + 1} 失败:`, error.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
      process.stdout.write(`\r✅ 已导入: ${inserted} / ${dbCards.length}`);
    }
  }
  
  console.log("\n");
  console.log("🎉 导入完成!");
  console.log(`   成功: ${inserted}`);
  console.log(`   失败: ${errors}`);
  
  // 验证
  const { count } = await supabase
    .from("cards")
    .select("*", { count: "exact", head: true });
  
  console.log(`\n📊 数据库中卡片总数: ${count}`);
}

importCards().catch(console.error);
