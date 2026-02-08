import { createClient } from "@supabase/supabase-js";

// 判断运行环境
const isServer = typeof window === "undefined";

// 服务端用 Docker 内部地址，客户端用相对路径
const supabaseUrl = isServer 
  ? (process.env.SUPABASE_URL || "http://host.docker.internal:54321")
  : (process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321");

const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 服务端专用客户端（用于 API 路由和服务端组件）
export function createServerClient() {
  const url = process.env.SUPABASE_URL || "http://host.docker.internal:54321";
  return createClient(url, supabaseAnonKey);
}

// 类型定义
export interface Card {
  id: number;
  name_en: string;
  name_jp: string | null;
  name_cn: string | null;
  card_type: string;
  sub_type: string | null;
  attribute: string | null;
  race: string | null;
  level: number | null;
  atk: number | null;
  def: number | null;
  desc_en: string;
  desc_jp: string | null;
  desc_cn: string | null;
  archetype: string | null;
  banlist_ocg: string | null;  // 禁限状态
  banlist_tcg: string | null;
  scale: number | null;  // 灵摆刻度
  linkval: number | null;  // Link值（有些数据库用这个字段）
}

// 获取单张卡片（服务端）
export async function getCard(id: number): Promise<Card | null> {
  const client = createServerClient();
  const { data, error } = await client
    .from("cards")
    .select("*")
    .eq("id", id)
    .single();
  
  if (error) {
    console.error("Error fetching card:", error);
    return null;
  }
  
  return data;
}

// 获取卡片列表（服务端）
export async function getCards(options?: {
  search?: string;
  cardType?: string;
  attribute?: string;
  limit?: number;
  offset?: number;
}): Promise<{ cards: Card[]; total: number }> {
  const client = createServerClient();
  let query = client.from("cards").select("*", { count: "exact" });
  
  if (options?.search) {
    query = query.or(`name_cn.ilike.%${options.search}%,name_jp.ilike.%${options.search}%,name_en.ilike.%${options.search}%`);
  }
  
  if (options?.cardType) {
    query = query.eq("card_type", options.cardType);
  }
  
  if (options?.attribute) {
    query = query.eq("attribute", options.attribute);
  }
  
  const limit = options?.limit || 24;
  const offset = options?.offset || 0;
  
  query = query.range(offset, offset + limit - 1);
  
  const { data, error, count } = await query;
  
  if (error) {
    console.error("Error fetching cards:", error);
    return { cards: [], total: 0 };
  }
  
  return { cards: data || [], total: count || 0 };
}
