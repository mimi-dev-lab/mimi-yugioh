/**
 * GET /api/cards/:id - 获取单张卡牌
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

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const id = context.params.id;
  
  const card = await context.env.DB.prepare('SELECT * FROM cards WHERE id = ?')
    .bind(id)
    .first();

  if (!card) {
    return Response.json({ error: 'Card not found' }, { status: 404 });
  }

  return Response.json(enrichCard(card));
};
