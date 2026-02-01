/**
 * GET /api/decks - 卡组列表
 */

interface Env {
  DB: D1Database;
}

const R2_BASE = 'https://pub-1aabbe3759be4cbb807f84c6b342a168.r2.dev';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const tier = url.searchParams.get('tier');
  const tag = url.searchParams.get('tag');

  let query = 'SELECT * FROM decks WHERE 1=1';
  const params: unknown[] = [];

  if (tier) {
    query += ' AND tier = ?';
    params.push(tier);
  }

  if (tag) {
    query += ' AND tags LIKE ?';
    params.push(`%"${tag}"%`);
  }

  query += ' ORDER BY updated_at DESC';

  const { results } = await context.env.DB.prepare(query).bind(...params).all();

  const decks = results?.map(deck => ({
    ...deck,
    tags: deck.tags ? JSON.parse(deck.tags as string) : [],
    thumbnail: deck.thumbnail_card_id 
      ? `${R2_BASE}/cn/${deck.thumbnail_card_id}.webp`
      : null,
  })) || [];

  return Response.json({ decks });
};
