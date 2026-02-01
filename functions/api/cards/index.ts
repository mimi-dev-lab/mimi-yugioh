/**
 * GET /api/cards - 搜索卡牌（完整筛选）
 * 
 * 参数：
 * - q: 搜索关键词
 * - frames: 卡片边框（逗号分隔）: 通常,效果,融合,仪式,同步,超量,灵摆,连接,魔法,陷阱
 * - attributes: 属性（逗号分隔）: DARK,LIGHT,EARTH,WATER,FIRE,WIND,DIVINE
 * - races: 种族（逗号分隔）: Dragon,Warrior,Spellcaster...
 * - spellTrapTypes: 魔陷种类（逗号分隔）: normal_spell,field_spell,continuous_trap...
 * - levels: 等级（逗号分隔）: 1,2,3...
 * - atkMin/atkMax: 攻击力范围
 * - defMin/defMax: 防御力范围
 * - page: 页码
 * - limit: 每页数量
 */

interface Env {
  DB: D1Database;
}

const R2_BASE = 'https://pub-1aabbe3759be4cbb807f84c6b342a168.r2.dev';

function enrichCard(card: Record<string, unknown>) {
  return {
    ...card,
    image_cn: `${R2_BASE}/cn/${card.id}.webp`,
    image_jp: `${R2_BASE}/jp/${card.id}.webp`,
  };
}

// 卡片边框 → SQL 条件
function getFrameConditions(frames: string[]): string[] {
  const conditions: string[] = [];
  
  for (const frame of frames) {
    switch (frame) {
      case '魔法':
        conditions.push("type LIKE '%Spell%'");
        break;
      case '陷阱':
        conditions.push("type LIKE '%Trap%'");
        break;
      case '连接':
        conditions.push("type LIKE '%Link%'");
        break;
      case '超量':
        conditions.push("type LIKE '%Xyz%'");
        break;
      case '同步':
        conditions.push("type LIKE '%Synchro%'");
        break;
      case '融合':
        conditions.push("type LIKE '%Fusion%'");
        break;
      case '仪式':
        conditions.push("(type LIKE '%Ritual%' AND type LIKE '%Monster%')");
        break;
      case '灵摆':
        conditions.push("type LIKE '%Pendulum%'");
        break;
      case '通常':
        conditions.push("(type LIKE '%Normal%' AND type LIKE '%Monster%' AND type NOT LIKE '%Spell%' AND type NOT LIKE '%Trap%')");
        break;
      case '效果':
        conditions.push("(type LIKE '%Effect%' AND type NOT LIKE '%Pendulum%' AND type NOT LIKE '%Link%' AND type NOT LIKE '%Xyz%' AND type NOT LIKE '%Synchro%' AND type NOT LIKE '%Fusion%')");
        break;
    }
  }
  
  return conditions;
}

// 魔陷种类 → SQL 条件
function getSpellTrapConditions(types: string[]): string[] {
  const conditions: string[] = [];
  
  for (const t of types) {
    switch (t) {
      case 'normal_spell':
        conditions.push("(type LIKE '%Spell%' AND race = 'Normal')");
        break;
      case 'field_spell':
        conditions.push("(type LIKE '%Spell%' AND race = 'Field')");
        break;
      case 'equip_spell':
        conditions.push("(type LIKE '%Spell%' AND race = 'Equip')");
        break;
      case 'continuous_spell':
        conditions.push("(type LIKE '%Spell%' AND race = 'Continuous')");
        break;
      case 'quickplay_spell':
        conditions.push("(type LIKE '%Spell%' AND race = 'Quick-Play')");
        break;
      case 'ritual_spell':
        conditions.push("(type LIKE '%Spell%' AND race = 'Ritual')");
        break;
      case 'normal_trap':
        conditions.push("(type LIKE '%Trap%' AND race = 'Normal')");
        break;
      case 'continuous_trap':
        conditions.push("(type LIKE '%Trap%' AND race = 'Continuous')");
        break;
      case 'counter_trap':
        conditions.push("(type LIKE '%Trap%' AND race = 'Counter')");
        break;
    }
  }
  
  return conditions;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  
  // 解析参数
  const q = url.searchParams.get('q') || '';
  const frames = url.searchParams.get('frames')?.split(',').filter(Boolean) || [];
  const attributes = url.searchParams.get('attributes')?.split(',').filter(Boolean) || [];
  const races = url.searchParams.get('races')?.split(',').filter(Boolean) || [];
  const spellTrapTypes = url.searchParams.get('spellTrapTypes')?.split(',').filter(Boolean) || [];
  const levels = url.searchParams.get('levels')?.split(',').map(Number).filter(n => !isNaN(n)) || [];
  const atkMin = url.searchParams.get('atkMin');
  const atkMax = url.searchParams.get('atkMax');
  const defMin = url.searchParams.get('defMin');
  const defMax = url.searchParams.get('defMax');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '48'), 100);
  const offset = (page - 1) * limit;

  // 构建 WHERE 条件
  const conditions: string[] = ['1=1'];
  const params: unknown[] = [];

  // 搜索关键词
  if (q) {
    conditions.push('(name_cn LIKE ? OR name LIKE ? OR name_jp LIKE ? OR desc_cn LIKE ?)');
    const searchTerm = `%${q}%`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm);
  }

  // 卡片边框
  if (frames.length > 0) {
    const frameConditions = getFrameConditions(frames);
    if (frameConditions.length > 0) {
      conditions.push(`(${frameConditions.join(' OR ')})`);
    }
  }

  // 属性
  if (attributes.length > 0) {
    const placeholders = attributes.map(() => '?').join(',');
    conditions.push(`attribute IN (${placeholders})`);
    params.push(...attributes);
  }

  // 种族（仅对怪兽卡）
  if (races.length > 0) {
    const placeholders = races.map(() => '?').join(',');
    conditions.push(`(race IN (${placeholders}) AND type LIKE '%Monster%')`);
    params.push(...races);
  }

  // 魔陷种类
  if (spellTrapTypes.length > 0) {
    const stConditions = getSpellTrapConditions(spellTrapTypes);
    if (stConditions.length > 0) {
      conditions.push(`(${stConditions.join(' OR ')})`);
    }
  }

  // 等级
  if (levels.length > 0) {
    const placeholders = levels.map(() => '?').join(',');
    conditions.push(`level IN (${placeholders})`);
    params.push(...levels);
  }

  // 攻击力范围
  if (atkMin) {
    conditions.push('atk >= ?');
    params.push(parseInt(atkMin));
  }
  if (atkMax) {
    conditions.push('atk <= ?');
    params.push(parseInt(atkMax));
  }

  // 防御力范围
  if (defMin) {
    conditions.push('def >= ?');
    params.push(parseInt(defMin));
  }
  if (defMax) {
    conditions.push('def <= ?');
    params.push(parseInt(defMax));
  }

  const whereClause = conditions.join(' AND ');

  // Count total
  const countQuery = `SELECT COUNT(*) as total FROM cards WHERE ${whereClause}`;
  const countResult = await context.env.DB.prepare(countQuery).bind(...params).first<{ total: number }>();

  // Get page
  const query = `SELECT * FROM cards WHERE ${whereClause} ORDER BY id LIMIT ? OFFSET ?`;
  const { results } = await context.env.DB.prepare(query).bind(...params, limit, offset).all();

  return Response.json({
    cards: results?.map(enrichCard) || [],
    pagination: {
      page,
      limit,
      total: countResult?.total || 0,
      totalPages: Math.ceil((countResult?.total || 0) / limit),
    },
  });
};
