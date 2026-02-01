/**
 * POST /api/cards/resolve - 批量解析卡名
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

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const body = await context.request.json() as { names: string[] };
  const names = body.names || [];

  if (names.length === 0) {
    return Response.json({ resolved: [], notFound: [] });
  }

  if (names.length > 200) {
    return Response.json({ error: 'Too many names (max 200)' }, { status: 400 });
  }

  const placeholders = names.map(() => '?').join(',');
  const { results } = await context.env.DB.prepare(
    `SELECT * FROM cards WHERE name_cn IN (${placeholders})`
  ).bind(...names).all();

  const foundMap = new Map<string, Record<string, unknown>>();
  results?.forEach(card => {
    foundMap.set(card.name_cn as string, enrichCard(card));
  });

  const resolved: Record<string, unknown>[] = [];
  const notFound: string[] = [];

  for (const name of names) {
    const card = foundMap.get(name);
    if (card) {
      resolved.push(card);
    } else {
      notFound.push(name);
    }
  }

  return Response.json({ resolved, notFound });
};
