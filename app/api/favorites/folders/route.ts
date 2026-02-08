import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.SUPABASE_URL || "http://host.docker.internal:54321";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const supabase = createClient(supabaseUrl, supabaseKey);

// GET - 获取所有收藏夹（含数量统计）
export async function GET() {
  try {
    // 获取收藏夹列表
    const { data: folders, error: foldersError } = await supabase
      .from("favorite_folders")
      .select("*")
      .order("sort_order", { ascending: true });

    if (foldersError) throw foldersError;

    // 获取每个收藏夹的卡片数量
    const { data: counts, error: countsError } = await supabase
      .from("favorites")
      .select("folder_id");

    if (countsError) throw countsError;

    // 统计数量
    const countMap: Record<string, number> = {};
    counts?.forEach((f) => {
      const fid = f.folder_id || "00000000-0000-0000-0000-000000000001";
      countMap[fid] = (countMap[fid] || 0) + 1;
    });

    const foldersWithCount = folders?.map((folder) => ({
      ...folder,
      card_count: countMap[folder.id] || 0,
    }));

    return NextResponse.json({ folders: foldersWithCount || [] });
  } catch (error) {
    console.error("获取收藏夹失败:", error);
    return NextResponse.json({ error: "获取收藏夹失败" }, { status: 500 });
  }
}

// POST - 创建收藏夹
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, color, icon } = body;

    if (!name) {
      return NextResponse.json({ error: "收藏夹名称不能为空" }, { status: 400 });
    }

    // 获取最大 sort_order
    const { data: maxOrder } = await supabase
      .from("favorite_folders")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .single();

    const { data, error } = await supabase
      .from("favorite_folders")
      .insert({
        name,
        description: description || null,
        color: color || "#daa520",
        icon: icon || "star",
        sort_order: (maxOrder?.sort_order || 0) + 1,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, folder: data });
  } catch (error) {
    console.error("创建收藏夹失败:", error);
    return NextResponse.json({ error: "创建收藏夹失败" }, { status: 500 });
  }
}

// PUT - 更新收藏夹
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, description, color, icon, sort_order } = body;

    if (!id) {
      return NextResponse.json({ error: "缺少收藏夹 ID" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (color !== undefined) updates.color = color;
    if (icon !== undefined) updates.icon = icon;
    if (sort_order !== undefined) updates.sort_order = sort_order;

    const { data, error } = await supabase
      .from("favorite_folders")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, folder: data });
  } catch (error) {
    console.error("更新收藏夹失败:", error);
    return NextResponse.json({ error: "更新收藏夹失败" }, { status: 500 });
  }
}

// DELETE - 删除收藏夹
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "缺少收藏夹 ID" }, { status: 400 });
  }

  // 禁止删除默认收藏夹
  const DEFAULT_FOLDER_ID = "00000000-0000-0000-0000-000000000001";
  if (id === DEFAULT_FOLDER_ID) {
    return NextResponse.json({ error: "不能删除默认收藏夹" }, { status: 400 });
  }

  try {
    // 先把该收藏夹的卡片移到默认收藏夹
    await supabase
      .from("favorites")
      .update({ folder_id: DEFAULT_FOLDER_ID })
      .eq("folder_id", id);

    // 然后删除收藏夹
    const { error } = await supabase
      .from("favorite_folders")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除收藏夹失败:", error);
    return NextResponse.json({ error: "删除收藏夹失败" }, { status: 500 });
  }
}
