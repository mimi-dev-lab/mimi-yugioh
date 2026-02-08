import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type Card } from "@/lib/supabase";

// 规范化卡名（与 match API 保持一致）
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[・·\-－—_\s]+/g, '')
    .replace(/[「」『』【】《》<>()（）\[\]]/g, '')
    .replace(/[！!？?。.、,，:：;；]/g, '')
    .trim()
}

// 查询别名对应的卡片ID（支持部分匹配）
async function getCardIdsByAlias(client: any, searchTerm: string): Promise<number[]> {
  const normalized = normalizeName(searchTerm)
  const lowercase = searchTerm.toLowerCase().trim()
  
  if (!normalized && !lowercase) return []
  
  // 部分匹配（别名包含搜索词，或搜索词包含别名）
  const { data } = await client
    .from('card_aliases')
    .select('card_id')
    .or(`alias.ilike.%${normalized}%,alias.ilike.%${lowercase}%`)
  
  // 去重
  const ids: number[] = data?.map((row: { card_id: number }) => row.card_id) || []
  return [...new Set(ids)] as number[]
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  
  // 基础参数
  const search = searchParams.get("search") || "";
  const searchMode = searchParams.get("searchMode") || "all"; // "name" = 仅卡名, "all" = 卡名+效果
  const cardType = searchParams.get("cardType") || "";
  
  // 多选筛选
  const subTypes = searchParams.getAll("subType");
  const attributes = searchParams.getAll("attribute");
  const races = searchParams.getAll("race");
  const archetypes = searchParams.getAll("archetype");
  const abilities = searchParams.getAll("ability");  // 能力·其他
  const levels = searchParams.getAll("level").map(Number).filter(n => !isNaN(n));  // 等级（多选）
  const linkValues = searchParams.getAll("linkValue").map(Number).filter(n => !isNaN(n));  // Link 值
  const pendulumScales = searchParams.getAll("pendulumScale").map(Number).filter(n => !isNaN(n));  // 灵摆刻度
  const banlistOcg = searchParams.get("banlistOcg") || "";
  
  // 攻/守范围筛选
  const atkMin = searchParams.get("atkMin") ? parseInt(searchParams.get("atkMin")!) : null;
  const atkMax = searchParams.get("atkMax") ? parseInt(searchParams.get("atkMax")!) : null;
  const defMin = searchParams.get("defMin") ? parseInt(searchParams.get("defMin")!) : null;
  const defMax = searchParams.get("defMax") ? parseInt(searchParams.get("defMax")!) : null;
  
  // 排序和分页
  const sortBy = searchParams.get("sortBy") || "id";
  const sortOrder = searchParams.get("sortOrder") || "asc";
  const offset = parseInt(searchParams.get("offset") || "0");
  const limit = parseInt(searchParams.get("limit") || "48");

  const client = createServerClient();
  let query = client.from("cards").select("*", { count: "exact" });

  // 关键词搜索（支持两种模式：仅卡名 / 卡名+效果）
  if (search) {
    // 先查别名表
    const aliasCardIds = await getCardIdsByAlias(client, search)
    
    if (searchMode === "name") {
      // 模式1: 仅搜索卡名 + 别名
      if (aliasCardIds.length > 0) {
        query = query.or(
          `name_cn.ilike.%${search}%,name_jp.ilike.%${search}%,name_en.ilike.%${search}%,id.in.(${aliasCardIds.join(',')})`
        );
      } else {
        query = query.or(
          `name_cn.ilike.%${search}%,name_jp.ilike.%${search}%,name_en.ilike.%${search}%`
        );
      }
    } else {
      // 模式2: 搜索卡名 + 效果 + 别名
      if (aliasCardIds.length > 0) {
        query = query.or(
          `name_cn.ilike.%${search}%,name_jp.ilike.%${search}%,name_en.ilike.%${search}%,desc_cn.ilike.%${search}%,desc_jp.ilike.%${search}%,desc_en.ilike.%${search}%,id.in.(${aliasCardIds.join(',')})`
        );
      } else {
        query = query.or(
          `name_cn.ilike.%${search}%,name_jp.ilike.%${search}%,name_en.ilike.%${search}%,desc_cn.ilike.%${search}%,desc_jp.ilike.%${search}%,desc_en.ilike.%${search}%`
        );
      }
    }
  }

  // 卡片类型
  if (cardType && cardType !== "全部") {
    query = query.eq("card_type", cardType);
  }

  // 子类型筛选（支持多选，使用 OR）
  if (subTypes.length > 0) {
    // 处理魔法/陷阱子类型（格式如 Spell-Normal, Trap-Counter）
    const monsterSubTypes = subTypes.filter(st => !st.includes("-"));
    const spellTrapSubTypes = subTypes.filter(st => st.includes("-"));
    
    const conditions: string[] = [];
    
    // 怪兽子类型
    monsterSubTypes.forEach(st => {
      conditions.push(`sub_type.ilike.%${st}%`);
    });
    
    // 魔法/陷阱子类型
    spellTrapSubTypes.forEach(st => {
      const [type, subType] = st.split("-");
      if (type === "Spell") {
        conditions.push(`sub_type.ilike.%${subType}%`);
      } else if (type === "Trap") {
        conditions.push(`sub_type.ilike.%${subType}%`);
      }
    });
    
    if (conditions.length > 0) {
      query = query.or(conditions.join(","));
    }
  }

  // 属性筛选（支持多选）
  if (attributes.length > 0) {
    query = query.in("attribute", attributes);
  }

  // 种族筛选（支持多选）
  if (races.length > 0) {
    query = query.in("race", races);
  }

  // 系列筛选（支持多选）
  if (archetypes.length > 0) {
    query = query.in("archetype", archetypes);
  }

  // 能力·其他筛选（在 sub_type 中搜索）
  if (abilities.length > 0) {
    const abilityConditions = abilities.map(ab => `sub_type.ilike.%${ab}%`).join(",");
    query = query.or(abilityConditions);
  }

  // 禁限卡筛选（OCG）
  if (banlistOcg) {
    query = query.eq("banlist_ocg", banlistOcg);
  }

  // 等级筛选（支持多选）
  if (levels.length > 0) {
    query = query.in("level", levels);
  }

  // Link 值筛选（对 Link 怪兽，link_value 字段或 level 字段存储）
  if (linkValues.length > 0) {
    // Link 怪兽的 "等级" 实际上存储的是 Link 值
    query = query.in("level", linkValues);
    query = query.ilike("sub_type", "%Link%");
  }

  // 灵摆刻度筛选
  if (pendulumScales.length > 0) {
    // 灵摆刻度存储在 scale 字段
    query = query.in("scale", pendulumScales);
  }

  // ATK 范围
  if (atkMin !== null) {
    query = query.gte("atk", atkMin);
  }
  if (atkMax !== null) {
    query = query.lte("atk", atkMax);
  }

  // DEF 范围
  if (defMin !== null) {
    query = query.gte("def", defMin);
  }
  if (defMax !== null) {
    query = query.lte("def", defMax);
  }

  // 排序
  const validSortFields = ["id", "name_cn", "name_en", "atk", "def", "level"];
  const sortField = validSortFields.includes(sortBy) ? sortBy : "id";
  query = query.order(sortField, { ascending: sortOrder === "asc", nullsFirst: false });

  // 分页
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    cards: data || [],
    total: count || 0,
  });
}
