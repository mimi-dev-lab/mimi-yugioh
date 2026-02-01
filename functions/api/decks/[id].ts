/**
 * GET /api/decks/:id - 卡组详情
 */

interface Env {
  DB: D1Database;
}

const R2_BASE = 'https://pub-1aabbe3759be4cbb807f84c6b342a168.r2.dev';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const id = context.params.id;
  
  const deck = await context.env.DB.prepare('SELECT * FROM decks WHERE id = ?')
    .bind(id)
    .first();

  if (!deck) {
    return Response.json({ error: 'Deck not found' }, { status: 404 });
  }

  return Response.json({
    ...deck,
    tags: deck.tags ? JSON.parse(deck.tags as string) : [],
    thumbnail: deck.thumbnail_card_id
      ? `${R2_BASE}/cn/${deck.thumbnail_card_id}.webp`
      : null,
  });
};
