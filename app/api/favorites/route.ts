import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.SUPABASE_URL || "http://host.docker.internal:54321";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const supabase = createClient(supabaseUrl, supabaseKey);

// GET - 获取所有收藏
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const folderId = searchParams.get("folder_id");
  const cardId = searchParams.get("card_id");

  try {
    // 检查单个卡片是否已收藏
    if (cardId) {
      const { data, error } = await supabase
        .from("favorites")
        .select("id, folder_id, note, created_at")
        .eq("card_id", parseInt(cardId));

      if (error) throw error;
      return NextResponse.json({ 
        is_favorited: data && data.length > 0,
        favorites: data || []
      });
    }

    // 获取收藏列表（带卡片详情）
    let query = supabase
      .from("favorite_cards_view")
      .select("*")
      .order("favorited_at", { ascending: false });

    if (folderId) {
      query = query.eq("folder_id", folderId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ favorites: data || [] });
  } catch (error) {
    console.error("获取收藏失败:", error);
    return NextResponse.json({ error: "获取收藏失败" }, { status: 500 });
  }
}

// POST - 添加收藏
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { card_id, folder_id, note } = body;

    if (!card_id) {
      return NextResponse.json({ error: "缺少 card_id" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("favorites")
      .insert({
        card_id,
        folder_id: folder_id || "00000000-0000-0000-0000-000000000001",
        note: note || null,
      })
      .select()
      .single();

    if (error) {
      // 如果是重复收藏
      if (error.code === "23505") {
        return NextResponse.json({ error: "已经收藏过了" }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ success: true, favorite: data });
  } catch (error) {
    console.error("添加收藏失败:", error);
    return NextResponse.json({ error: "添加收藏失败" }, { status: 500 });
  }
}

// PATCH - 更新收藏（移动收藏夹、添加备注）
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { card_id, folder_id, note } = body;

    if (!card_id) {
      return NextResponse.json({ error: "缺少 card_id" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (folder_id !== undefined) updates.folder_id = folder_id;
    if (note !== undefined) updates.note = note;

    const { data, error } = await supabase
      .from("favorites")
      .update(updates)
      .eq("card_id", card_id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, favorite: data });
  } catch (error) {
    console.error("更新收藏失败:", error);
    return NextResponse.json({ error: "更新收藏失败" }, { status: 500 });
  }
}

// DELETE - 取消收藏
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cardId = searchParams.get("card_id");
  const folderId = searchParams.get("folder_id");
  const favoriteId = searchParams.get("id");

  try {
    let query = supabase.from("favorites").delete();

    if (favoriteId) {
      query = query.eq("id", favoriteId);
    } else if (cardId) {
      query = query.eq("card_id", parseInt(cardId));
      if (folderId) {
        query = query.eq("folder_id", folderId);
      }
    } else {
      return NextResponse.json({ error: "需要提供 id 或 card_id" }, { status: 400 });
    }

    const { error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("取消收藏失败:", error);
    return NextResponse.json({ error: "取消收藏失败" }, { status: 500 });
  }
}
