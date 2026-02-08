"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { 
  Search, Database, Wand2, Sparkles, Filter, Box, Layout,
  ChevronDown, ChevronRight, X, RotateCcw, Star, Heart, Plus, FolderPlus, Check, Trash2, Loader2
} from "lucide-react";
import { type Card } from "@/lib/supabase";
import { cn } from "@/lib/utils";

// ============ 收藏相关类型 ============
interface FavoriteFolder {
  id: string;
  name: string;
  description?: string;
  color: string;
  icon: string;
  card_count: number;
}

interface FavoriteCard {
  favorite_id: string;
  card_id: number;
  folder_id: string;
  folder_name: string;
  folder_color: string;
  favorited_at: string;
  note?: string;
  // Card fields from view
  name_cn?: string;
  name_jp?: string;
  name_en?: string;
  card_type?: string;
  sub_type?: string;
  attribute?: string;
  race?: string;
  level?: number;
  atk?: number | null;
  def?: number | null;
  desc_cn?: string;
  desc_jp?: string;
  desc_en?: string;
  archetype?: string;
  banlist_ocg?: string;
}

// Toast 组件
function Toast({ message, type, onClose }: { message: string; type: "success" | "error"; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 2500);
    return () => clearTimeout(timer);
  }, [onClose]);
  
  return (
    <div className={cn(
      "fixed bottom-6 right-6 z-[200] px-4 py-3 rounded border-2 shadow-lg animate-[smoothAppear_0.2s_ease-out]",
      type === "success" ? "bg-green-900/90 border-green-500 text-green-200" : "bg-red-900/90 border-red-500 text-red-200"
    )}>
      <div className="flex items-center gap-2">
        {type === "success" ? <Check size={16} /> : <X size={16} />}
        <span className="text-sm font-bold">{message}</span>
      </div>
    </div>
  );
}

// ============ 设计系统常量 ============

const ATTR_COLORS: Record<string, { border: string; text: string; shadow: string; bg: string }> = {
  LIGHT: { border: "border-[#fff176]", text: "text-[#fff176]", shadow: "shadow-[0_0_15px_rgba(255,241,118,0.3)]", bg: "bg-yellow-400" },
  DARK: { border: "border-[#ce93d8]", text: "text-[#ce93d8]", shadow: "shadow-[0_0_15px_rgba(206,147,216,0.3)]", bg: "bg-violet-500" },
  FIRE: { border: "border-[#ff7043]", text: "text-[#ff7043]", shadow: "shadow-[0_0_15px_rgba(255,112,67,0.3)]", bg: "bg-red-500" },
  WATER: { border: "border-[#4fc3f7]", text: "text-[#4fc3f7]", shadow: "shadow-[0_0_15px_rgba(79,195,247,0.3)]", bg: "bg-blue-500" },
  EARTH: { border: "border-[#a1887f]", text: "text-[#a1887f]", shadow: "shadow-[0_0_15px_rgba(161,136,127,0.3)]", bg: "bg-amber-700" },
  WIND: { border: "border-[#81c784]", text: "text-[#81c784]", shadow: "shadow-[0_0_15px_rgba(129,199,132,0.3)]", bg: "bg-emerald-500" },
  DIVINE: { border: "border-[#ffd700]", text: "text-[#ffd700]", shadow: "shadow-[0_0_15px_rgba(255,215,0,0.4)]", bg: "bg-orange-500" },
};

const ATTR_CN: Record<string, string> = {
  "DARK": "暗", "LIGHT": "光", "EARTH": "地",
  "WATER": "水", "FIRE": "炎", "WIND": "风", "DIVINE": "神",
};

const RACE_CN: Record<string, string> = {
  "Dragon": "龙族", "Warrior": "战士族", "Spellcaster": "魔法使族",
  "Fiend": "恶魔族", "Machine": "机械族", "Fairy": "天使族",
  "Zombie": "不死族", "Beast": "兽族", "Beast-Warrior": "兽战士族",
  "Winged Beast": "鸟兽族", "Insect": "昆虫族", "Plant": "植物族",
  "Aqua": "水族", "Fish": "鱼族", "Sea Serpent": "海龙族",
  "Reptile": "爬虫族", "Rock": "岩石族", "Pyro": "炎族",
  "Thunder": "雷族", "Dinosaur": "恐龙族", "Cyberse": "电子界族",
  "Wyrm": "幻龙族", "Psychic": "念动力族",
  "Divine-Beast": "幻神兽族", "Creator-God": "创世神族",
};

const CARD_TYPE_BG: Record<string, string> = {
  "Monster": "bg-[#1a1510]",
  "Spell": "bg-[#101a15]",
  "Trap": "bg-[#1a1015]",
};

// 收藏夹颜色选项
const FOLDER_COLORS = [
  { name: "金色", value: "#daa520" },
  { name: "红色", value: "#ff6b6b" },
  { name: "蓝色", value: "#4fc3f7" },
  { name: "绿色", value: "#81c784" },
  { name: "紫色", value: "#ce93d8" },
  { name: "橙色", value: "#ff9800" },
  { name: "青色", value: "#26c6da" },
  { name: "粉色", value: "#f48fb1" },
];

// 额外卡组怪兽类型（显示全息效果）
const EXTRA_DECK_TYPES = ["Fusion", "Synchro", "Xyz", "Link"];

// 怪兽子类型
const MONSTER_SUMMON_TYPES = [
  { value: "Fusion", label: "融合" },
  { value: "Synchro", label: "同调" },
  { value: "Xyz", label: "超量" },
  { value: "Link", label: "连接" },
  { value: "Pendulum", label: "灵摆" },
  { value: "Ritual", label: "仪式" },
];

const MONSTER_FEATURE_TYPES = [
  { value: "Normal", label: "通常" },
  { value: "Effect", label: "效果" },
  { value: "Tuner", label: "调整" },
  { value: "Flip", label: "翻转" },
];

// 魔法/陷阱子类型
const SPELL_SUB_TYPES = [
  { value: "Normal", label: "通常" },
  { value: "Quick-Play", label: "速攻" },
  { value: "Continuous", label: "永续" },
  { value: "Equip", label: "装备" },
  { value: "Field", label: "场地" },
  { value: "Ritual", label: "仪式" },
];

const TRAP_SUB_TYPES = [
  { value: "Normal", label: "通常" },
  { value: "Continuous", label: "永续" },
  { value: "Counter", label: "反击" },
];

// 属性列表
const ATTRIBUTES = [
  { value: "DARK", label: "暗" },
  { value: "LIGHT", label: "光" },
  { value: "EARTH", label: "地" },
  { value: "WATER", label: "水" },
  { value: "FIRE", label: "炎" },
  { value: "WIND", label: "风" },
  { value: "DIVINE", label: "神" },
];

// 全部种族（25个）
const ALL_RACES = [
  { value: "Spellcaster", label: "魔法师族" },
  { value: "Dragon", label: "龙族" },
  { value: "Zombie", label: "不死族" },
  { value: "Warrior", label: "战士族" },
  { value: "Beast-Warrior", label: "兽战士族" },
  { value: "Beast", label: "兽族" },
  { value: "Winged Beast", label: "鸟兽族" },
  { value: "Machine", label: "机械族" },
  { value: "Fiend", label: "恶魔族" },
  { value: "Fairy", label: "天使族" },
  { value: "Insect", label: "昆虫族" },
  { value: "Dinosaur", label: "恐龙族" },
  { value: "Reptile", label: "爬虫类族" },
  { value: "Fish", label: "鱼族" },
  { value: "Sea Serpent", label: "海龙族" },
  { value: "Aqua", label: "水族" },
  { value: "Pyro", label: "炎族" },
  { value: "Thunder", label: "雷族" },
  { value: "Rock", label: "岩石族" },
  { value: "Plant", label: "植物族" },
  { value: "Psychic", label: "念动力族" },
  { value: "Wyrm", label: "幻龙族" },
  { value: "Cyberse", label: "电子界族" },
  { value: "Divine-Beast", label: "幻神兽族" },
  { value: "Illusion", label: "幻想魔族" },
];

// 子类型中文映射（用于弹窗显示）
const SUBTYPE_CN: Record<string, string> = {
  // 召唤方式
  "Fusion": "融合",
  "Synchro": "同调",
  "Xyz": "超量",
  "Link": "连接",
  "Pendulum": "灵摆",
  "Ritual": "仪式",
  // 怪兽特性
  "Normal": "通常",
  "Effect": "效果",
  "Tuner": "调整",
  "Flip": "翻转",
  // 能力
  "Toon": "卡通",
  "Gemini": "二重",
  "Union": "同盟",
  "Spirit": "灵魂",
  "Special Summon": "特殊召唤",
  // 魔法
  "Quick-Play": "速攻",
  "Continuous": "永续",
  "Equip": "装备",
  "Field": "场地",
  // 陷阱
  "Counter": "反击",
};

// 能力·其他
const ABILITY_TYPES = [
  { value: "Toon", label: "卡通" },
  { value: "Gemini", label: "二重" },
  { value: "Union", label: "同盟" },
  { value: "Spirit", label: "灵魂" },
  { value: "Tuner", label: "协调" },
  { value: "Flip", label: "翻转" },
  { value: "Special Summon", label: "特殊召唤" },
];

// 等级列表 (0-13，包含Link值和阶级)
const LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// Link 值
const LINK_VALUES = [1, 2, 3, 4, 5, 6];

// 灵摆刻度
const PENDULUM_SCALES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

// 热门系列
const POPULAR_ARCHETYPES = [
  { value: "Blue-Eyes", label: "青眼" },
  { value: "Dark Magician", label: "黑魔导" },
  { value: "Red-Eyes", label: "真红眼" },
  { value: "Elemental HERO", label: "元素英雄" },
  { value: "D/D", label: "DD" },
  { value: "Salamangreat", label: "转生炎兽" },
  { value: "Sky Striker", label: "闪刀姬" },
  { value: "Tearlaments", label: "泪之女王" },
];

// 预设筛选
const PRESET_FILTERS = [
  { id: "handtrap", name: "手坑", icon: "🖐️", description: "灰流/增G/无限", filter: { search: "灰流" } },
  { id: "forbidden", name: "禁卡", icon: "🚫", description: "OCG禁止卡", filter: { banlistOcg: "Forbidden" } },
  { id: "dragon", name: "龙族", icon: "🐉", description: "龙族怪兽", filter: { cardType: "Monster", races: ["Dragon"] } },
  { id: "extra", name: "额外", icon: "⭐", description: "融合/同调/超量/连接", filter: { cardType: "Monster", subTypes: ["Fusion", "Synchro", "Xyz", "Link"] } },
  { id: "spell", name: "魔法", icon: "✨", description: "全部魔法卡", filter: { cardType: "Spell" } },
  { id: "trap", name: "陷阱", icon: "⚡", description: "全部陷阱卡", filter: { cardType: "Trap" } },
  { id: "link4", name: "Link-4", icon: "🔗", description: "连接4怪兽", filter: { cardType: "Monster", subTypes: ["Link"], levelRange: [4, 4] } },
  { id: "boss", name: "大怪", icon: "👹", description: "ATK≥3000", filter: { cardType: "Monster", atkRange: [3000, 5000] } },
];

// 导航标签
const NAV_TABS = [
  { id: "library", label: "卡牌书库", icon: Database, href: null },
  { id: "collection", label: "我的收藏", icon: Box, href: null },
  { id: "deck", label: "卡组构筑", icon: Layout, href: "/decks" },
];

// 默认筛选状态
const DEFAULT_FILTERS = {
  cardType: "全部",
  subTypes: [] as string[],
  attributes: [] as string[],
  races: [] as string[],
  archetypes: [] as string[],
  abilities: [] as string[],  // 能力·其他
  banlistOcg: "",
  levels: [] as number[],  // 单选等级（可多选）
  linkValues: [] as number[],  // Link 值
  pendulumScales: [] as number[],  // 灵摆刻度
  atkMin: null as number | null,
  atkMax: null as number | null,
  defMin: null as number | null,
  defMax: null as number | null,
};

// ============ 工具函数 ============

function parseFiltersFromURL(searchParams: URLSearchParams) {
  return {
    cardType: searchParams.get("type") || DEFAULT_FILTERS.cardType,
    subTypes: searchParams.getAll("sub"),
    attributes: searchParams.getAll("attr"),
    races: searchParams.getAll("race"),
    archetypes: searchParams.getAll("arch"),
    abilities: searchParams.getAll("ability"),
    banlistOcg: searchParams.get("ban") || "",
    levels: searchParams.getAll("lv").map(Number),
    linkValues: searchParams.getAll("link").map(Number),
    pendulumScales: searchParams.getAll("scale").map(Number),
    atkMin: searchParams.get("atkMin") ? parseInt(searchParams.get("atkMin")!) : null,
    atkMax: searchParams.get("atkMax") ? parseInt(searchParams.get("atkMax")!) : null,
    defMin: searchParams.get("defMin") ? parseInt(searchParams.get("defMin")!) : null,
    defMax: searchParams.get("defMax") ? parseInt(searchParams.get("defMax")!) : null,
  };
}

function filtersToURLParams(filters: typeof DEFAULT_FILTERS, search: string, sortBy: string, sortOrder: string) {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (filters.cardType !== "全部") params.set("type", filters.cardType);
  filters.subTypes.forEach(s => params.append("sub", s));
  filters.attributes.forEach(a => params.append("attr", a));
  filters.races.forEach(r => params.append("race", r));
  filters.archetypes.forEach(a => params.append("arch", a));
  filters.abilities.forEach(a => params.append("ability", a));
  filters.levels.forEach(l => params.append("lv", String(l)));
  filters.linkValues.forEach(l => params.append("link", String(l)));
  filters.pendulumScales.forEach(s => params.append("scale", String(s)));
  if (filters.banlistOcg) params.set("ban", filters.banlistOcg);
  if (filters.atkMin !== null) params.set("atkMin", String(filters.atkMin));
  if (filters.atkMax !== null) params.set("atkMax", String(filters.atkMax));
  if (filters.defMin !== null) params.set("defMin", String(filters.defMin));
  if (filters.defMax !== null) params.set("defMax", String(filters.defMax));
  if (sortBy !== "id") params.set("sort", sortBy);
  if (sortOrder !== "asc") params.set("order", sortOrder);
  return params;
}

// ============ 子组件 ============

function MagicCircleBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none flex items-center justify-center opacity-[0.06] z-0 overflow-hidden">
      <div className="w-[800px] h-[800px] border-[16px] border-[#daa520] rounded-full border-dashed animate-[spin_60s_linear_infinite]" />
      <div className="absolute w-[600px] h-[600px] border-[8px] border-[#daa520] rounded-full animate-[spin_40s_linear_infinite_reverse]" />
      <div className="absolute w-[400px] h-[400px] border-[4px] border-[#daa520] rounded-full border-dotted animate-[spin_20s_linear_infinite]" />
    </div>
  );
}

function Header({ activeTab, onTabChange, favoriteCount }: { activeTab: string; onTabChange: (tab: string) => void; favoriteCount?: number }) {
  return (
    <header className="max-w-7xl mx-auto mb-6 relative z-10">
      <div className="relative p-0.5 bg-gradient-to-r from-[#5c4002] via-[#daa520] to-[#5c4002]">
        <div className="bg-[#0d0d0d] p-5 flex flex-col lg:flex-row items-center justify-between gap-4 border-2 border-black">
          <div className="flex items-center gap-4 group">
            <div className="relative">
              <div className="absolute inset-0 bg-[#daa520] blur-xl opacity-10 group-hover:opacity-30 transition-opacity" />
              <div className="w-14 h-14 bg-[#1a1a1a] border-2 border-[#daa520] flex items-center justify-center shadow-[inset_0_0_10px_rgba(218,165,32,0.4)]">
                <Wand2 size={28} className="text-[#daa520] animate-pulse" />
              </div>
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-black italic tracking-[-0.05em] text-transparent bg-clip-text bg-gradient-to-b from-[#fff176] to-[#b8860b] uppercase">
                咪咪的决斗卡牌库
              </h1>
              <span className="text-xs text-[#daa520]/50 font-bold tracking-wider uppercase flex items-center gap-1">
                <Sparkles size={10} /> 決闘者の誇り、ここに刻まれる
              </span>
            </div>
          </div>

          <nav className="flex flex-wrap justify-center gap-2">
            {NAV_TABS.map((tab) => {
              const buttonContent = (
                <>
                  <tab.icon size={16} />
                  {tab.label}
                  {tab.id === "collection" && favoriteCount !== undefined && favoriteCount > 0 && (
                    <span className={cn(
                      "ml-1 px-1.5 py-0.5 text-xs rounded-full",
                      activeTab === tab.id ? "bg-black/20 text-black" : "bg-[#daa520] text-black"
                    )}>
                      {favoriteCount}
                    </span>
                  )}
                </>
              );
              
              const buttonClass = cn(
                "relative px-5 py-2 border-2 border-black font-bold text-sm flex items-center gap-2 transition-all active:translate-y-0.5 uppercase",
                activeTab === tab.id
                  ? "bg-[#daa520] text-black shadow-[3px_3px_0px_#5c4002] -translate-y-0.5"
                  : "bg-black text-[#5c4002] hover:text-[#daa520]"
              );
              
              if (tab.href) {
                return (
                  <Link key={tab.id} href={tab.href} className={buttonClass}>
                    {buttonContent}
                  </Link>
                );
              }
              
              return (
                <button key={tab.id} onClick={() => onTabChange(tab.id)} className={buttonClass}>
                  {buttonContent}
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}

function FilterSection({ 
  title, 
  count, 
  open, 
  onToggle, 
  children 
}: { 
  title: string; 
  count?: number; 
  open: boolean; 
  onToggle: () => void; 
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-[#333] pb-3">
      <button onClick={onToggle} className="flex items-center justify-between w-full py-2 text-left group">
        <span className="text-sm font-bold text-[#daa520] uppercase tracking-wider group-hover:text-[#fff176] transition-colors">
          {title}
          {count !== undefined && count > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-[#daa520] text-black text-xs rounded">{count}</span>
          )}
        </span>
        <ChevronRight className={cn("w-4 h-4 text-[#5c4002] transition-transform duration-200", open && "rotate-90")} />
      </button>
      {open && <div className="pt-2">{children}</div>}
    </div>
  );
}

function TagButton({ selected, onClick, children, color }: { selected: boolean; onClick: () => void; children: React.ReactNode; color?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 text-sm font-bold border transition-all",
        selected
          ? color || "bg-[#daa520] text-black border-[#daa520]"
          : "bg-transparent text-[#5c4002] border-[#333] hover:border-[#daa520] hover:text-[#daa520]"
      )}
    >
      {children}
    </button>
  );
}

function FilterSidebar({
  filters,
  onFilterChange,
  onApply,
  onClear,
  hasChanges,
  filterCount,
}: {
  filters: typeof DEFAULT_FILTERS;
  onFilterChange: (updates: Partial<typeof DEFAULT_FILTERS>) => void;
  onApply: () => void;
  onClear: () => void;
  hasChanges: boolean;
  filterCount: number;
}) {
  const [openSections, setOpenSections] = useState({
    type: true,
    subType: true,
    attribute: true,
    spellTrapType: false,
    race: false,
    level: false,
    stats: false,
    ability: false,
    archetype: false,
    banlist: false,
  });

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleSubType = (value: string) => {
    const newSubTypes = filters.subTypes.includes(value)
      ? filters.subTypes.filter(s => s !== value)
      : [...filters.subTypes, value];
    onFilterChange({ subTypes: newSubTypes });
  };

  const toggleAttribute = (value: string) => {
    const newAttributes = filters.attributes.includes(value)
      ? filters.attributes.filter(a => a !== value)
      : [...filters.attributes, value];
    onFilterChange({ attributes: newAttributes });
  };

  const toggleRace = (value: string) => {
    const newRaces = filters.races.includes(value)
      ? filters.races.filter(r => r !== value)
      : [...filters.races, value];
    onFilterChange({ races: newRaces });
  };

  const toggleAbility = (value: string) => {
    const newAbilities = filters.abilities.includes(value)
      ? filters.abilities.filter(a => a !== value)
      : [...filters.abilities, value];
    onFilterChange({ abilities: newAbilities });
  };

  const toggleLevel = (value: number) => {
    const newLevels = filters.levels.includes(value)
      ? filters.levels.filter(l => l !== value)
      : [...filters.levels, value];
    onFilterChange({ levels: newLevels });
  };

  const toggleLinkValue = (value: number) => {
    const newLinkValues = filters.linkValues.includes(value)
      ? filters.linkValues.filter(l => l !== value)
      : [...filters.linkValues, value];
    onFilterChange({ linkValues: newLinkValues });
  };

  const toggleArchetype = (value: string) => {
    const newArchetypes = filters.archetypes.includes(value)
      ? filters.archetypes.filter(a => a !== value)
      : [...filters.archetypes, value];
    onFilterChange({ archetypes: newArchetypes });
  };

  const isMonster = filters.cardType === "Monster" || filters.cardType === "全部";
  const isSpell = filters.cardType === "Spell";
  const isTrap = filters.cardType === "Trap";
  const isSpellOrTrap = isSpell || isTrap || filters.cardType === "全部";
  const hasLink = filters.subTypes.includes("Link");
  const hasPendulum = filters.subTypes.includes("Pendulum");

  return (
    <aside className="w-full xl:w-80 space-y-4">
      <div className="bg-[#111] border-2 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] relative overflow-hidden flex flex-col max-h-[calc(100vh-200px)]">
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-[#daa520] to-transparent" />
        
        {/* 头部 - 固定 */}
        <div className="flex items-center justify-between p-5 pb-3 bg-[#111] border-b border-[#333]">
          <h3 className="text-base font-black text-[#daa520] flex items-center gap-2 uppercase tracking-widest">
            <Filter size={14} /> 筛选设置
          </h3>
          {filterCount > 0 && (
            <button onClick={onClear} className="text-sm text-[#5c4002] hover:text-[#daa520] flex items-center gap-1">
              <RotateCcw size={14} /> 清除
            </button>
          )}
        </div>
        
        {/* 滚动区域 */}
        <div className="flex-1 overflow-y-auto p-5 pt-3">

        <div className="space-y-2">
          {/* 卡片边框 (类型) */}
          <FilterSection title="卡片边框" open={openSections.type} onToggle={() => toggleSection("type")}>
            <div className="flex flex-wrap gap-1.5">
              {/* 怪兽类型 */}
              {[
                { value: "Normal", label: "通常" },
                { value: "Effect", label: "效果" },
                { value: "Fusion", label: "融合" },
                { value: "Ritual", label: "仪式" },
                { value: "Synchro", label: "同步" },
                { value: "Xyz", label: "超量" },
                { value: "Pendulum", label: "灵摆" },
                { value: "Link", label: "连接" },
              ].map(t => (
                <TagButton key={t.value} selected={filters.subTypes.includes(t.value)} onClick={() => toggleSubType(t.value)}>
                  {t.label}
                </TagButton>
              ))}
              {/* 魔法陷阱 */}
              <TagButton selected={filters.cardType === "Spell"} onClick={() => onFilterChange({ cardType: filters.cardType === "Spell" ? "全部" : "Spell" })}>
                魔法
              </TagButton>
              <TagButton selected={filters.cardType === "Trap"} onClick={() => onFilterChange({ cardType: filters.cardType === "Trap" ? "全部" : "Trap" })}>
                陷阱
              </TagButton>
            </div>
          </FilterSection>

          {/* 属性 */}
          <FilterSection title="属性" count={filters.attributes.length} open={openSections.attribute} onToggle={() => toggleSection("attribute")}>
            <div className="flex flex-wrap gap-1.5">
              {ATTRIBUTES.map(attr => (
                <TagButton key={attr.value} selected={filters.attributes.includes(attr.value)} onClick={() => toggleAttribute(attr.value)}>
                  {attr.label}
                </TagButton>
              ))}
            </div>
          </FilterSection>

          {/* 魔法·陷阱的种类 */}
          {isSpellOrTrap && (
            <FilterSection title="魔法·陷阱种类" count={filters.subTypes.filter(s => SPELL_SUB_TYPES.some(t => t.value === s) || TRAP_SUB_TYPES.some(t => t.value === s)).length} open={openSections.spellTrapType} onToggle={() => toggleSection("spellTrapType")}>
              <div className="space-y-3">
                {(filters.cardType === "Spell" || filters.cardType === "全部") && (
                  <div className="flex flex-wrap gap-1.5">
                    {SPELL_SUB_TYPES.map(t => (
                      <TagButton key={`spell-${t.value}`} selected={filters.subTypes.includes(`Spell-${t.value}`)} onClick={() => toggleSubType(`Spell-${t.value}`)}>
                        {t.label}魔法
                      </TagButton>
                    ))}
                  </div>
                )}
                {(filters.cardType === "Trap" || filters.cardType === "全部") && (
                  <div className="flex flex-wrap gap-1.5">
                    {TRAP_SUB_TYPES.map(t => (
                      <TagButton key={`trap-${t.value}`} selected={filters.subTypes.includes(`Trap-${t.value}`)} onClick={() => toggleSubType(`Trap-${t.value}`)}>
                        {t.label}陷阱
                      </TagButton>
                    ))}
                  </div>
                )}
              </div>
            </FilterSection>
          )}

          {/* 种族 (全部25个) */}
          <FilterSection title="种族" count={filters.races.length} open={openSections.race} onToggle={() => toggleSection("race")}>
            <div className="flex flex-wrap gap-1.5">
              {ALL_RACES.map(r => (
                <TagButton key={r.value} selected={filters.races.includes(r.value)} onClick={() => toggleRace(r.value)}>
                  {r.label}
                </TagButton>
              ))}
            </div>
          </FilterSection>

          {/* 等级·阶级 */}
          <FilterSection title="等级·阶级" count={filters.levels.length} open={openSections.level} onToggle={() => toggleSection("level")}>
            <div className="flex flex-wrap gap-1.5">
              {LEVELS.map(lv => (
                <button
                  key={lv}
                  onClick={() => toggleLevel(lv)}
                  className={cn(
                    "w-9 h-9 flex items-center justify-center text-sm font-bold border transition-all",
                    filters.levels.includes(lv)
                      ? "bg-[#daa520] text-black border-[#daa520]"
                      : "bg-transparent text-[#5c4002] border-[#333] hover:border-[#daa520] hover:text-[#daa520]"
                  )}
                >
                  {lv}
                </button>
              ))}
            </div>
            {/* Link 值 */}
            {hasLink && (
              <div className="mt-3">
                <div className="text-xs text-[#5c4002] uppercase mb-2 font-bold">Link 值</div>
                <div className="flex flex-wrap gap-1.5">
                  {LINK_VALUES.map(lv => (
                    <button
                      key={`link-${lv}`}
                      onClick={() => toggleLinkValue(lv)}
                      className={cn(
                        "w-9 h-9 flex items-center justify-center text-sm font-bold border transition-all",
                        filters.linkValues.includes(lv)
                          ? "bg-[#4fc3f7] text-black border-[#4fc3f7]"
                          : "bg-transparent text-[#5c4002] border-[#333] hover:border-[#4fc3f7] hover:text-[#4fc3f7]"
                      )}
                    >
                      {lv}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* 灵摆刻度 */}
            {hasPendulum && (
              <div className="mt-3">
                <div className="text-xs text-[#5c4002] uppercase mb-2 font-bold">灵摆刻度</div>
                <div className="flex flex-wrap gap-1.5">
                  {PENDULUM_SCALES.map(scale => (
                    <button
                      key={`scale-${scale}`}
                      onClick={() => {
                        const newScales = filters.pendulumScales.includes(scale)
                          ? filters.pendulumScales.filter(s => s !== scale)
                          : [...filters.pendulumScales, scale];
                        onFilterChange({ pendulumScales: newScales });
                      }}
                      className={cn(
                        "w-8 h-8 flex items-center justify-center text-xs font-bold border transition-all",
                        filters.pendulumScales.includes(scale)
                          ? "bg-[#f06292] text-white border-[#f06292]"
                          : "bg-transparent text-[#5c4002] border-[#333] hover:border-[#f06292] hover:text-[#f06292]"
                      )}
                    >
                      {scale}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </FilterSection>

          {/* 攻击力/守备力 */}
          <FilterSection 
            title="攻击力/守备力" 
            count={(filters.atkMin !== null || filters.atkMax !== null || filters.defMin !== null || filters.defMax !== null) ? 1 : 0}
            open={openSections.stats} 
            onToggle={() => toggleSection("stats")}
          >
            <div className="space-y-5">
              {/* 攻击力 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-[#5c4002] uppercase font-bold flex items-center gap-2">
                    ⚔️ 攻击力
                  </span>
                  <span className="text-xs text-[#daa520] font-bold">
                    {filters.atkMin ?? 0} ~ {filters.atkMax ?? 5000}
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[#5c4002] w-8">MIN</span>
                    <input
                      type="range"
                      min="0"
                      max="5000"
                      step="100"
                      value={filters.atkMin ?? 0}
                      onChange={(e) => onFilterChange({ atkMin: parseInt(e.target.value) || null })}
                      className="flex-1 h-2 bg-[#333] rounded appearance-none cursor-pointer accent-red-500"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[#5c4002] w-8">MAX</span>
                    <input
                      type="range"
                      min="0"
                      max="5000"
                      step="100"
                      value={filters.atkMax ?? 5000}
                      onChange={(e) => onFilterChange({ atkMax: parseInt(e.target.value) || null })}
                      className="flex-1 h-2 bg-[#333] rounded appearance-none cursor-pointer accent-red-500"
                    />
                  </div>
                </div>
              </div>
              {/* 守备力 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-[#5c4002] uppercase font-bold flex items-center gap-2">
                    🛡️ 守备力
                  </span>
                  <span className="text-xs text-[#daa520] font-bold">
                    {filters.defMin ?? 0} ~ {filters.defMax ?? 5000}
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[#5c4002] w-8">MIN</span>
                    <input
                      type="range"
                      min="0"
                      max="5000"
                      step="100"
                      value={filters.defMin ?? 0}
                      onChange={(e) => onFilterChange({ defMin: parseInt(e.target.value) || null })}
                      className="flex-1 h-2 bg-[#333] rounded appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[#5c4002] w-8">MAX</span>
                    <input
                      type="range"
                      min="0"
                      max="5000"
                      step="100"
                      value={filters.defMax ?? 5000}
                      onChange={(e) => onFilterChange({ defMax: parseInt(e.target.value) || null })}
                      className="flex-1 h-2 bg-[#333] rounded appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          </FilterSection>

          {/* 能力·其他 */}
          <FilterSection title="能力·其他" count={filters.abilities.length} open={openSections.ability} onToggle={() => toggleSection("ability")}>
            <div className="flex flex-wrap gap-1.5">
              {ABILITY_TYPES.map(a => (
                <TagButton key={a.value} selected={filters.abilities.includes(a.value)} onClick={() => toggleAbility(a.value)}>
                  {a.label}
                </TagButton>
              ))}
            </div>
          </FilterSection>

          {/* 系列 */}
          <FilterSection title="系列" count={filters.archetypes.length} open={openSections.archetype} onToggle={() => toggleSection("archetype")}>
            <div className="flex flex-wrap gap-1.5">
              {POPULAR_ARCHETYPES.map(a => (
                <TagButton key={a.value} selected={filters.archetypes.includes(a.value)} onClick={() => toggleArchetype(a.value)}>
                  {a.label}
                </TagButton>
              ))}
            </div>
          </FilterSection>

          {/* 禁限 */}
          <FilterSection title="禁限" count={filters.banlistOcg ? 1 : 0} open={openSections.banlist} onToggle={() => toggleSection("banlist")}>
            <div className="flex flex-wrap gap-1.5">
              {[
                { value: "", label: "全部" },
                { value: "Forbidden", label: "禁止" },
                { value: "Limited", label: "限制" },
                { value: "Semi-Limited", label: "准限" },
              ].map(opt => (
                <TagButton
                  key={opt.value}
                  selected={filters.banlistOcg === opt.value}
                  onClick={() => onFilterChange({ banlistOcg: opt.value })}
                  color={
                    filters.banlistOcg === opt.value
                      ? opt.value === "Forbidden" ? "bg-red-500 text-white border-red-500"
                        : opt.value === "Limited" ? "bg-yellow-500 text-black border-yellow-500"
                        : opt.value === "Semi-Limited" ? "bg-green-500 text-white border-green-500"
                        : undefined
                      : undefined
                  }
                >
                  {opt.label}
                </TagButton>
              ))}
            </div>
          </FilterSection>
        </div>
        </div>

        {/* 应用按钮 - 固定在底部 */}
        <div className="p-5 pt-3 bg-[#111] border-t border-[#333]">
          <button
            onClick={onApply}
            className={cn(
              "w-full py-3 text-sm font-black uppercase tracking-wider border-2 transition-all",
              hasChanges || filterCount > 0
                ? "bg-[#daa520] text-black border-[#daa520] hover:bg-[#fff176]"
                : "bg-transparent text-[#5c4002] border-[#333] hover:border-[#daa520]"
            )}
          >
            应用筛选 {filterCount > 0 && `(${filterCount})`}
          </button>
        </div>
      </div>

      {/* 系统状态 */}
      <div className="hidden xl:block bg-black/80 border border-[#daa520]/20 p-3 font-mono text-[9px] text-[#daa520]/40 space-y-0.5">
        <p className="animate-pulse flex items-center gap-1"><Sparkles size={8} /> 魔法阵已激活</p>
        <p>&gt; 连接决斗者档案库...</p>
      </div>
    </aside>
  );
}

function CardItem({ card, onClick, isFavorited, onToggleFavorite, onAddToDeck }: { 
  card: Card; 
  onClick: () => void;
  isFavorited?: boolean;
  onToggleFavorite?: (e: React.MouseEvent) => void;
  onAddToDeck?: (e: React.MouseEvent, card: Card) => void;
}) {
  const cardType = card.card_type || "Monster";
  const attribute = card.attribute || "DARK";
  const colors = ATTR_COLORS[attribute] || ATTR_COLORS.DARK;
  const level = card.level;
  const isHolo = card.sub_type && EXTRA_DECK_TYPES.some(t => card.sub_type?.includes(t));

  return (
    <div className="group relative cursor-pointer" onClick={onClick}>
      {/* 快捷按钮组 */}
      <div className="absolute top-2 right-2 z-20 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* 收藏按钮 */}
        {onToggleFavorite && (
          <button
            onClick={onToggleFavorite}
            className={cn(
              "w-7 h-7 flex items-center justify-center rounded-full border-2 transition-all",
              isFavorited 
                ? "bg-[#daa520] border-[#daa520] text-black favorite-animate" 
                : "bg-black/70 border-[#5c4002] text-[#5c4002] hover:border-[#daa520] hover:text-[#daa520]"
            )}
          >
            <Star size={14} fill={isFavorited ? "currentColor" : "none"} />
          </button>
        )}
        {/* 添加到卡组按钮 */}
        {onAddToDeck && (
          <button
            onClick={(e) => onAddToDeck(e, card)}
            className="w-7 h-7 flex items-center justify-center rounded-full border-2 bg-black/70 border-green-600 text-green-500 hover:bg-green-600 hover:text-black transition-all"
            title="添加到卡组"
          >
            <Plus size={14} />
          </button>
        )}
      </div>
      <div className={cn(
        "relative border-[4px] border-black transition-all duration-300",
        "group-hover:-translate-y-1.5 group-hover:shadow-[0_15px_30px_rgba(0,0,0,0.8)]",
        CARD_TYPE_BG[cardType] || "bg-[#1a1a1a]"
      )}>
        <div className="absolute -inset-0.5 border border-[#daa520]/20 pointer-events-none group-hover:border-[#daa520]/50 transition-colors" />
        
        <div className={cn("aspect-[421/614] relative overflow-hidden border-b-[4px] border-black", colors.border)}>
          <Image
            src={`/card-images/cn/${card.id}.webp`}
            alt={card.name_cn || card.name_en}
            fill
            className="object-cover opacity-95 group-hover:opacity-100 transition-opacity"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 20vw, 150px"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              if (target.src.includes('/cn/')) target.src = `/card-images/jp/${card.id}.webp`;
              else if (target.src.includes('/jp/')) target.src = `/card-images/en/${card.id}.jpg`;
            }}
          />
          {isHolo && (
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent animate-[holoSweep_4s_linear_infinite] pointer-events-none" />
          )}
          <div className={cn("absolute top-1 right-1 bg-black/90 text-[8px] font-black px-1 py-0.5 border z-10", colors.border, colors.text)}>
            {ATTR_CN[attribute] || attribute}
          </div>
          {level && level > 0 && (
            <div className="absolute bottom-1 left-1 flex gap-0.5 z-10">
              {[...Array(Math.min(level, 5))].map((_, i) => (
                <div key={i} className="w-1 h-1 bg-yellow-500 rotate-45 border border-black shadow-[0_0_4px_#fbbf24]" />
              ))}
              {level > 5 && <span className="text-[7px] text-yellow-400 font-bold ml-0.5">+{level - 5}</span>}
            </div>
          )}
        </div>

        <div className="p-2 bg-[#111]">
          <h4 className="text-xs font-bold text-[#f3eacb] truncate group-hover:text-white transition-colors">
            {card.name_cn || card.name_en}
          </h4>
          <div className="flex justify-between items-center mt-1.5 pt-1.5 border-t border-[#333]">
            <span className="text-[10px] text-[#5c4002] font-bold">#{String(card.id).slice(-4)}</span>
            {card.atk !== null ? (
              <span className="text-xs font-bold">
                <span className="text-red-400">{card.atk}</span>
                <span className="text-[#333] mx-0.5">/</span>
                <span className="text-blue-400">{card.def ?? '?'}</span>
              </span>
            ) : (
              <span className="text-[10px] text-[#daa520] font-bold">{cardType === "Spell" ? "魔法" : "陷阱"}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// 禁限状态
const BANLIST_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  "Forbidden": { label: "禁止", color: "text-white", bg: "bg-red-600" },
  "Limited": { label: "限制", color: "text-black", bg: "bg-yellow-400" },
  "Semi-Limited": { label: "准限", color: "text-white", bg: "bg-green-600" },
};

// 语言配置
const LANGUAGES = [
  { code: "cn", label: "中文" },
  { code: "jp", label: "日文" },
  { code: "en", label: "英文" },
] as const;

type Language = typeof LANGUAGES[number]["code"];

function CardDetailModal({ card, onClose, onPrev, onNext, hasPrev, hasNext, onTagClick, isFavorited, currentFolderId, onToggleFavorite, folders, onMoveToFolder }: {
  card: Card; 
  onClose: () => void; 
  onPrev: () => void; 
  onNext: () => void; 
  hasPrev: boolean; 
  hasNext: boolean;
  onTagClick?: (type: string, value: string) => void;
  isFavorited?: boolean;
  currentFolderId?: string | null;
  onToggleFavorite?: () => void;
  folders?: FavoriteFolder[];
  onMoveToFolder?: (folderId: string) => void;
}) {
  const [lang, setLang] = useState<Language>("cn");
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);
  
  // 当前收藏夹名称
  const currentFolderName = folders?.find(f => f.id === currentFolderId)?.name;
  
  const attribute = card.attribute || "DARK";
  const cardType = card.card_type || "Monster";
  const isMonster = cardType === "Monster";
  const isLink = card.sub_type?.includes("Link");
  const isPendulum = card.sub_type?.includes("Pendulum");
  const isXyz = card.sub_type?.includes("Xyz");
  const banStatus = card.banlist_ocg ? BANLIST_STATUS[card.banlist_ocg as keyof typeof BANLIST_STATUS] : null;

  // 根据语言获取内容
  const getName = (): string => {
    if (lang === "cn") return card.name_cn || card.name_jp || card.name_en || "Unknown";
    if (lang === "jp") return card.name_jp || card.name_cn || card.name_en || "Unknown";
    return card.name_en || card.name_cn || card.name_jp || "Unknown";
  };
  const getSubName = () => {
    if (lang === "cn") return card.name_jp;
    if (lang === "jp") return card.name_cn;
    return card.name_jp || card.name_cn;
  };
  const getDesc = () => {
    if (lang === "cn") return card.desc_cn || card.desc_jp || card.desc_en;
    if (lang === "jp") return card.desc_jp || card.desc_cn || card.desc_en;
    return card.desc_en || card.desc_cn || card.desc_jp;
  };
  const getImagePath = () => {
    // 所有语言统一用 webp
    return `/card-images/${lang}/${card.id}.webp`;
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && hasPrev) onPrev();
      else if (e.key === "ArrowRight" && hasNext) onNext();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  // 获取子类型显示文本（中文）
  const getSubTypeText = () => {
    if (!card.sub_type) return null;
    const parts = card.sub_type.split(" ").filter(p => p !== "Monster" && p !== "Card");
    const translated = parts.map(p => SUBTYPE_CN[p] || p);
    return translated.length > 0 ? translated.join(" / ") : null;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/95 backdrop-blur-md" onClick={onClose}>
      <div className="w-full max-w-4xl relative animate-[smoothAppear_0.3s_ease-out_forwards]" onClick={(e) => e.stopPropagation()}>
        <div className="absolute -inset-4 bg-[#daa520] opacity-10 blur-3xl animate-pulse" />
        
        <div className="relative border-4 border-black bg-[#0d0d0d] shadow-[0_0_60px_rgba(218,165,32,0.1)] overflow-hidden">
          <div className="flex flex-col md:flex-row">
            {/* 左侧：卡图 */}
            <div className="md:w-[40%] bg-[#151515] p-6 flex flex-col items-center justify-center border-r-4 border-black">
              {/* 语言切换按钮 */}
              <div className="flex gap-1 mb-3 w-full justify-center">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => setLang(l.code)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-bold border-2 transition-all",
                      lang === l.code
                        ? "bg-[#daa520] text-black border-[#daa520]"
                        : "bg-transparent text-[#5c4002] border-[#333] hover:border-[#daa520] hover:text-[#daa520]"
                    )}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
              
              <div 
                className="w-full aspect-[421/614] border-4 border-black bg-black relative overflow-hidden cursor-zoom-in group/img"
                onClick={() => setShowFullImage(true)}
              >
                <Image
                  src={getImagePath()}
                  alt={getName()}
                  fill
                  className="object-contain transition-transform duration-300 group-hover/img:scale-[1.02]"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    // fallback: 任何语言失败都回退到 cn
                    if (!target.src.includes('/cn/')) {
                      target.src = `/card-images/cn/${card.id}.webp`;
                    }
                  }}
                />
                {/* 点击提示 */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover/img:bg-black/30 transition-all">
                  <div className="opacity-0 group-hover/img:opacity-100 transition-opacity text-white text-sm font-bold flex items-center gap-2 bg-black/60 px-3 py-2 border border-[#daa520]">
                    <Search size={16} /> 点击放大
                  </div>
                </div>
              </div>
              
              {/* 导航按钮 */}
              <div className="mt-4 flex gap-2 w-full">
                <button onClick={onPrev} disabled={!hasPrev} className={cn("flex-1 py-2.5 text-sm font-bold border-2 border-[#333] transition-all", hasPrev ? "text-[#5c4002] hover:text-[#daa520] hover:border-[#daa520]" : "text-[#333] cursor-not-allowed")}>
                  ← 上一张
                </button>
                <button onClick={onClose} className="flex-1 py-2.5 text-sm font-bold border-2 border-[#333] text-[#5c4002] hover:text-[#daa520] hover:border-[#daa520] transition-all">
                  关闭
                </button>
                <button onClick={onNext} disabled={!hasNext} className={cn("flex-1 py-2.5 text-sm font-bold border-2 border-[#333] transition-all", hasNext ? "text-[#5c4002] hover:text-[#daa520] hover:border-[#daa520]" : "text-[#333] cursor-not-allowed")}>
                  下一张 →
                </button>
              </div>
            </div>

            {/* 右侧：详情 */}
            <div className="md:w-[60%] p-6 bg-[#0d0d0d] flex flex-col">
              {/* 头部：卡名 */}
              <div className="flex items-start gap-4 mb-3">
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl md:text-2xl font-black text-[#fff176] leading-tight mb-1">
                    {getName()}
                  </h2>
                  {getSubName() && <p className="text-xs text-[#5c4002] truncate">{getSubName()}</p>}
                </div>

                {/* 禁限状态 */}
                {banStatus && (
                  <div className={cn("px-2 py-1 text-xs font-black", banStatus.bg, banStatus.color)}>
                    {banStatus.label}
                  </div>
                )}
              </div>

              {/* 等级/阶级/Link值 */}
              {isMonster && card.level && (
                <div className="flex items-center gap-2 mb-3">
                  {isLink ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-[#4fc3f7] font-bold">LINK-{card.level}</span>
                    </div>
                  ) : isXyz ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-[#5c4002] mr-1">阶级</span>
                      {[...Array(Math.min(card.level, 12))].map((_, i) => (
                        <div key={i} className="w-3 h-3 rotate-45 bg-black border-2 border-[#daa520]" />
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-[#5c4002] mr-1">等级</span>
                      {[...Array(Math.min(card.level, 12))].map((_, i) => (
                        <div key={i} className="w-3 h-3 rotate-45 bg-[#daa520] border border-black shadow-[0_0_4px_#daa520]" />
                      ))}
                    </div>
                  )}
                  
                  {/* 灵摆刻度 */}
                  {isPendulum && card.scale !== undefined && (
                    <div className="ml-4 flex items-center gap-1">
                      <span className="text-xs text-[#f06292] font-bold">灵摆刻度: {card.scale}</span>
                    </div>
                  )}
                </div>
              )}

              {/* 标签 */}
              <div className="flex flex-wrap gap-2 mb-4 pb-4 border-b border-[#333]">
                {/* 卡片类型 */}
                <span className="text-xs bg-[#daa520] text-black px-2 py-1 font-bold">
                  {cardType === "Monster" ? "怪兽" : cardType === "Spell" ? "魔法" : "陷阱"}
                </span>
                
                {/* 子类型 */}
                {getSubTypeText() && (
                  <span className="text-xs bg-[#333] text-[#daa520] px-2 py-1 font-bold">
                    {getSubTypeText()}
                  </span>
                )}
                
                {/* 种族（可点击） */}
                {card.race && (
                  <button 
                    onClick={() => onTagClick?.("race", card.race!)}
                    className="text-xs border border-[#5c4002] text-[#5c4002] px-2 py-1 font-bold hover:bg-[#5c4002] hover:text-black transition-colors"
                  >
                    {RACE_CN[card.race] || card.race}
                  </button>
                )}
                
                {/* 系列（可点击） */}
                {card.archetype && (
                  <button 
                    onClick={() => onTagClick?.("archetype", card.archetype!)}
                    className="text-xs border border-[#daa520] text-[#daa520] px-2 py-1 font-bold hover:bg-[#daa520] hover:text-black transition-colors"
                  >
                    {card.archetype}
                  </button>
                )}
              </div>

              {/* 攻击力/守备力 */}
              {card.atk !== null && (
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-500 font-bold">攻击力</span>
                    <span className="text-xl font-black text-[#fff176] font-mono">{card.atk}</span>
                  </div>
                  {!isLink && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-blue-500 font-bold">守备力</span>
                      <span className="text-xl font-black text-[#fff176] font-mono">{card.def ?? '----'}</span>
                    </div>
                  )}
                </div>
              )}

              {/* 效果描述 */}
              <div className="flex-1 bg-[#111] p-4 border-2 border-[#333] relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-[#daa520]/30 to-transparent" />
                <p className="text-sm leading-relaxed text-[#f3eacb]/90 whitespace-pre-wrap overflow-y-auto max-h-48">
                  {getDesc() || '无效果描述'}
                </p>
              </div>

              {/* 底部信息 */}
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#333]">
                <span className="text-xs text-[#333] font-mono">ID: {card.id}</span>
                <div className="relative flex items-center gap-2">
                  {/* 收藏/取消收藏按钮 */}
                  <button 
                    onClick={() => onToggleFavorite?.()}
                    className={cn(
                      "text-xs flex items-center gap-1.5 px-3 py-1.5 border-2 transition-all font-bold",
                      isFavorited 
                        ? "bg-[#daa520] border-[#daa520] text-black hover:bg-red-500 hover:border-red-500 hover:text-white" 
                        : "border-[#5c4002] text-[#5c4002] hover:border-[#daa520] hover:text-[#daa520]"
                    )}
                    title={isFavorited ? "点击取消收藏" : "点击收藏"}
                  >
                    <Star size={14} fill={isFavorited ? "currentColor" : "none"} />
                    {isFavorited ? "已收藏" : "收藏"}
                  </button>
                  
                  {/* 移动收藏夹按钮 - 只有已收藏且有多个收藏夹时显示 */}
                  {isFavorited && folders && folders.length > 0 && (
                    <button 
                      onClick={() => setShowFolderMenu(!showFolderMenu)}
                      className={cn(
                        "text-xs px-2 py-1.5 border-2 transition-colors flex items-center gap-1",
                        showFolderMenu 
                          ? "border-[#daa520] text-[#daa520]" 
                          : "border-[#333] text-[#5c4002] hover:border-[#daa520] hover:text-[#daa520]"
                      )}
                      title="移动到其他收藏夹"
                    >
                      <FolderPlus size={14} />
                      <span className="hidden sm:inline">移动</span>
                    </button>
                  )}
                  
                  {/* 收藏夹选择菜单 */}
                  {showFolderMenu && folders && (
                    <div className="absolute bottom-full right-0 mb-2 bg-[#111] border-2 border-[#daa520] shadow-xl z-50 min-w-[200px]">
                      <div className="p-2 border-b border-[#333] text-xs text-[#daa520] font-bold">
                        移动到收藏夹
                      </div>
                      {folders.map(folder => {
                        const isCurrent = folder.id === currentFolderId;
                        return (
                          <button
                            key={folder.id}
                            onClick={() => { 
                              if (!isCurrent) {
                                onMoveToFolder?.(folder.id); 
                              }
                              setShowFolderMenu(false); 
                            }}
                            disabled={isCurrent}
                            className={cn(
                              "w-full px-3 py-2 text-left text-xs flex items-center gap-2 transition-colors",
                              isCurrent 
                                ? "bg-[#1a1a1a] cursor-not-allowed" 
                                : "hover:bg-[#1a1a1a]"
                            )}
                          >
                            <div className="w-3 h-3 rounded" style={{ backgroundColor: folder.color }} />
                            <span className={isCurrent ? "text-[#daa520] font-bold" : "text-[#f3eacb]"}>
                              {folder.name}
                            </span>
                            {isCurrent && (
                              <Check size={12} className="text-[#daa520]" />
                            )}
                            <span className="text-[#555] ml-auto">({folder.card_count})</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* 全屏图片查看 */}
      {showFullImage && (
        <div 
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/98 cursor-zoom-out"
          onClick={() => setShowFullImage(false)}
        >
          {/* 魔法阵背景 */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
            <div className="w-[150vmax] h-[150vmax] border-[3px] border-[#daa520]/20 rounded-full animate-[spin_30s_linear_infinite]" />
            <div className="absolute w-[120vmax] h-[120vmax] border-[2px] border-[#daa520]/15 rounded-full animate-[spin_25s_linear_infinite_reverse]" />
            <div className="absolute w-[90vmax] h-[90vmax] border-[1px] border-[#daa520]/10 rounded-full border-dashed animate-[spin_20s_linear_infinite]" />
          </div>
          
          {/* 四角装饰 */}
          <div className="absolute top-8 left-8 w-16 h-16 border-l-2 border-t-2 border-[#daa520]/50" />
          <div className="absolute top-8 right-8 w-16 h-16 border-r-2 border-t-2 border-[#daa520]/50" />
          <div className="absolute bottom-8 left-8 w-16 h-16 border-l-2 border-b-2 border-[#daa520]/50" />
          <div className="absolute bottom-8 right-8 w-16 h-16 border-r-2 border-b-2 border-[#daa520]/50" />
          
          {/* 卡片容器 */}
          <div 
            className="relative animate-[cardReveal_0.5s_ease-out_forwards]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 发光效果 */}
            <div className="absolute -inset-8 bg-[#daa520]/20 blur-3xl animate-[glow_2s_ease-in-out_infinite]" />
            <div className="absolute -inset-4 bg-[#daa520]/10 blur-xl" />
            
            {/* 卡片边框 */}
            <div className="relative border-4 border-[#daa520] shadow-[0_0_80px_rgba(218,165,32,0.4),inset_0_0_20px_rgba(218,165,32,0.1)]">
              {/* 角落装饰 */}
              <div className="absolute -top-2 -left-2 w-4 h-4 bg-[#daa520]" />
              <div className="absolute -top-2 -right-2 w-4 h-4 bg-[#daa520]" />
              <div className="absolute -bottom-2 -left-2 w-4 h-4 bg-[#daa520]" />
              <div className="absolute -bottom-2 -right-2 w-4 h-4 bg-[#daa520]" />
              
              {/* 卡片图片 */}
              <div className="relative w-[80vmin] max-w-[500px] aspect-[421/614] bg-black overflow-hidden">
                <Image
                  src={getImagePath()}
                  alt={getName()}
                  fill
                  className="object-contain"
                  priority
                  sizes="80vmin"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    if (!target.src.includes('/cn/')) {
                      target.src = `/card-images/cn/${card.id}.webp`;
                    }
                  }}
                />
                
                {/* 闪光效果 */}
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent animate-[shimmer_3s_ease-in-out_infinite]" />
                
                {/* 全息扫描线 */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#daa520]/10 to-transparent h-[30%] animate-[scanLine_2s_ease-in-out_infinite]" />
                </div>
              </div>
            </div>
            
            {/* 卡名 */}
            <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 text-center whitespace-nowrap">
              <div className="text-xl font-black text-[#fff176] drop-shadow-[0_0_10px_rgba(255,241,118,0.5)]">
                {getName()}
              </div>
              <div className="text-sm text-[#daa520]/70 mt-1">点击任意位置关闭</div>
            </div>
          </div>
          
          {/* 关闭按钮 */}
          <button 
            onClick={() => setShowFullImage(false)}
            className="absolute top-6 right-6 w-12 h-12 flex items-center justify-center border-2 border-[#daa520] text-[#daa520] hover:bg-[#daa520] hover:text-black transition-all"
          >
            <X size={24} />
          </button>
        </div>
      )}
    </div>
  );
}

// ============ 主组件 ============

export function AncientLedgerClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // 从 URL 初始化
  const initialSearch = searchParams.get("q") || "";
  const initialFilters = parseFiltersFromURL(searchParams);
  const initialSort = searchParams.get("sort") || "id";
  const initialOrder = (searchParams.get("order") as "asc" | "desc") || "asc";
  const hasInitialParams = searchParams.toString().length > 0;

  // 状态
  const [activeTab, setActiveTab] = useState("library");
  const [cards, setCards] = useState<Card[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [hasSearched, setHasSearched] = useState(hasInitialParams);

  const [search, setSearch] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [searchMode, setSearchMode] = useState<"name" | "all">("name"); // name=仅卡名, all=卡名+效果
  const [pendingFilters, setPendingFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [sortBy, setSortBy] = useState(initialSort);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(initialOrder);

  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // 收藏相关状态
  const [favoriteCardIds, setFavoriteCardIds] = useState<Set<number>>(new Set());
  const [favoriteCardFolders, setFavoriteCardFolders] = useState<Map<number, string>>(new Map()); // cardId -> folderId
  const [favoriteFolders, setFavoriteFolders] = useState<FavoriteFolder[]>([]);
  const [favoriteCards, setFavoriteCards] = useState<FavoriteCard[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [loadingFavorites, setLoadingFavorites] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState("#daa520");
  
  // 移动到收藏夹功能
  const [showMoveModal, setShowMoveModal] = useState<{ cardId: number; currentFolderId: string | null } | null>(null);

  // 卡组相关状态
  const [decks, setDecks] = useState<{ id: string; name: string; card_count: number }[]>([]);
  const [showAddToDeckModal, setShowAddToDeckModal] = useState<{ card: Card } | null>(null);
  const [addingToDeck, setAddingToDeck] = useState(false);

  const pageSize = 48;
  const loaderRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  // 计算筛选数量
  const filterCount = appliedFilters.subTypes.length + appliedFilters.attributes.length + appliedFilters.races.length + 
    appliedFilters.archetypes.length + appliedFilters.abilities.length + appliedFilters.levels.length + 
    appliedFilters.linkValues.length + appliedFilters.pendulumScales.length +
    (appliedFilters.banlistOcg ? 1 : 0) + (appliedFilters.cardType !== "全部" ? 1 : 0) +
    (appliedFilters.atkMin !== null || appliedFilters.atkMax !== null ? 1 : 0) +
    (appliedFilters.defMin !== null || appliedFilters.defMax !== null ? 1 : 0);

  const hasChanges = JSON.stringify(pendingFilters) !== JSON.stringify(appliedFilters);

  // 防抖搜索（仅在卡名模式下自动触发）
  useEffect(() => {
    if (searchMode !== "name") return; // 全文模式不自动搜索
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      if (search.length >= 2) setHasSearched(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, searchMode]);
  
  // 全文模式：按回车触发搜索
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && searchMode === "all") {
      setDebouncedSearch(search);
      if (search.length >= 1) setHasSearched(true);
    }
  };

  // 更新 URL
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (!hasSearched) return;
    const params = filtersToURLParams(appliedFilters, debouncedSearch, sortBy, sortOrder);
    const newUrl = params.toString() ? `?${params.toString()}` : "/cards";
    router.replace(newUrl, { scroll: false });
  }, [appliedFilters, debouncedSearch, sortBy, sortOrder, hasSearched, router]);

  // 获取卡片
  const fetchCards = useCallback(async (reset = false) => {
    if (!hasSearched && !debouncedSearch) return;
    setLoading(true);
    
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (searchMode === "name") params.set("searchMode", "name"); // 仅搜卡名
    if (appliedFilters.cardType !== "全部") params.set("cardType", appliedFilters.cardType);
    appliedFilters.subTypes.forEach(st => params.append("subType", st));
    appliedFilters.attributes.forEach(attr => params.append("attribute", attr));
    appliedFilters.races.forEach(race => params.append("race", race));
    appliedFilters.archetypes.forEach(arch => params.append("archetype", arch));
    appliedFilters.abilities.forEach(ab => params.append("ability", ab));
    appliedFilters.levels.forEach(lv => params.append("level", String(lv)));
    appliedFilters.linkValues.forEach(lv => params.append("linkValue", String(lv)));
    appliedFilters.pendulumScales.forEach(s => params.append("pendulumScale", String(s)));
    if (appliedFilters.banlistOcg) params.set("banlistOcg", appliedFilters.banlistOcg);
    if (appliedFilters.atkMin !== null) params.set("atkMin", String(appliedFilters.atkMin));
    if (appliedFilters.atkMax !== null) params.set("atkMax", String(appliedFilters.atkMax));
    if (appliedFilters.defMin !== null) params.set("defMin", String(appliedFilters.defMin));
    if (appliedFilters.defMax !== null) params.set("defMax", String(appliedFilters.defMax));
    params.set("sortBy", sortBy);
    params.set("sortOrder", sortOrder);
    params.set("offset", String(reset ? 0 : cards.length));
    params.set("limit", String(pageSize));
    
    try {
      const res = await fetch(`/api/cards?${params.toString()}`);
      const data = await res.json();
      if (data.cards) {
        setCards(reset ? data.cards : [...cards, ...data.cards]);
        setTotal(data.total || 0);
        setHasMore(data.cards.length === pageSize);
      }
    } catch (error) {
      console.error("Error fetching cards:", error);
    }
    setLoading(false);
  }, [hasSearched, debouncedSearch, appliedFilters, sortBy, sortOrder, cards, pageSize, searchMode]);

  // 搜索/筛选变化时重新加载
  useEffect(() => {
    if (hasSearched || debouncedSearch) fetchCards(true);
  }, [debouncedSearch, appliedFilters, sortBy, sortOrder, hasSearched, searchMode]);

  // ============ 收藏相关函数 ============
  
  // 获取所有收藏夹
  const fetchFolders = useCallback(async () => {
    try {
      const res = await fetch("/api/favorites/folders");
      const data = await res.json();
      if (data.folders) setFavoriteFolders(data.folders);
    } catch (error) {
      console.error("获取收藏夹失败:", error);
    }
  }, []);

  // 获取收藏的卡片ID列表（同时保存所在收藏夹）
  const fetchFavoriteIds = useCallback(async () => {
    try {
      const res = await fetch("/api/favorites");
      const data = await res.json();
      if (data.favorites) {
        const ids = new Set<number>(data.favorites.map((f: FavoriteCard) => f.card_id));
        const folders = new Map<number, string>();
        data.favorites.forEach((f: FavoriteCard) => {
          folders.set(f.card_id, f.folder_id);
        });
        setFavoriteCardIds(ids);
        setFavoriteCardFolders(folders);
      }
    } catch (error) {
      console.error("获取收藏ID失败:", error);
    }
  }, []);

  // 获取收藏的卡片（带详情）
  const fetchFavoriteCards = useCallback(async (folderId?: string) => {
    setLoadingFavorites(true);
    try {
      const url = folderId ? `/api/favorites?folder_id=${folderId}` : "/api/favorites";
      const res = await fetch(url);
      const data = await res.json();
      if (data.favorites) setFavoriteCards(data.favorites);
    } catch (error) {
      console.error("获取收藏卡片失败:", error);
    }
    setLoadingFavorites(false);
  }, []);

  // 添加/取消收藏
  const toggleFavorite = useCallback(async (cardId: number, folderId?: string) => {
    const isFavorited = favoriteCardIds.has(cardId);
    const targetFolderId = folderId || "00000000-0000-0000-0000-000000000001";
    
    try {
      if (isFavorited) {
        // 取消收藏
        await fetch(`/api/favorites?card_id=${cardId}`, { method: "DELETE" });
        setFavoriteCardIds(prev => { const next = new Set(prev); next.delete(cardId); return next; });
        setFavoriteCardFolders(prev => { const next = new Map(prev); next.delete(cardId); return next; });
        setFavoriteCards(prev => prev.filter(c => c.card_id !== cardId));
        setToast({ message: "已取消收藏", type: "success" });
      } else {
        // 添加收藏
        await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ card_id: cardId, folder_id: targetFolderId }),
        });
        setFavoriteCardIds(prev => new Set([...prev, cardId]));
        setFavoriteCardFolders(prev => { const next = new Map(prev); next.set(cardId, targetFolderId); return next; });
        setToast({ message: "已添加到收藏", type: "success" });
      }
      // 刷新收藏夹数量
      fetchFolders();
    } catch (error) {
      console.error("操作收藏失败:", error);
      setToast({ message: "操作失败", type: "error" });
    }
  }, [favoriteCardIds, fetchFolders]);

  // 创建收藏夹
  const createFolder = useCallback(async (name: string, color?: string) => {
    try {
      const res = await fetch("/api/favorites/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color: color || "#daa520" }),
      });
      const data = await res.json();
      if (data.success) {
        setToast({ message: `已创建收藏夹 "${name}"`, type: "success" });
        fetchFolders();
        setShowNewFolderModal(false);
        setNewFolderName("");
        setNewFolderColor("#daa520");
      }
    } catch (error) {
      console.error("创建收藏夹失败:", error);
      setToast({ message: "创建失败", type: "error" });
    }
  }, [fetchFolders]);

  // 移动卡片到其他收藏夹
  const moveToFolder = useCallback(async (cardId: number, folderId: string) => {
    try {
      const res = await fetch("/api/favorites", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card_id: cardId, folder_id: folderId }),
      });
      const data = await res.json();
      if (data.success) {
        const folder = favoriteFolders.find(f => f.id === folderId);
        setToast({ message: `已移动到 "${folder?.name || '收藏夹'}"`, type: "success" });
        // 更新本地状态
        setFavoriteCardFolders(prev => { const next = new Map(prev); next.set(cardId, folderId); return next; });
        fetchFavoriteCards(selectedFolderId || undefined);
        fetchFolders();
        setShowMoveModal(null);
      }
    } catch (error) {
      console.error("移动失败:", error);
      setToast({ message: "移动失败", type: "error" });
    }
  }, [favoriteFolders, selectedFolderId, fetchFavoriteCards, fetchFolders]);

  // 删除收藏夹
  const deleteFolder = useCallback(async (folderId: string) => {
    if (folderId === "00000000-0000-0000-0000-000000000001") {
      setToast({ message: "不能删除默认收藏夹", type: "error" });
      return;
    }
    try {
      await fetch(`/api/favorites/folders?id=${folderId}`, { method: "DELETE" });
      setToast({ message: "已删除收藏夹", type: "success" });
      fetchFolders();
      if (selectedFolderId === folderId) setSelectedFolderId(null);
    } catch (error) {
      console.error("删除收藏夹失败:", error);
      setToast({ message: "删除失败", type: "error" });
    }
  }, [fetchFolders, selectedFolderId]);

  // ============ 卡组相关函数 ============

  // 获取卡组列表
  const fetchDecks = useCallback(async () => {
    try {
      const res = await fetch("/api/decks");
      const data = await res.json();
      if (Array.isArray(data)) setDecks(data);
    } catch (error) {
      console.error("获取卡组列表失败:", error);
    }
  }, []);

  // 添加卡片到卡组
  const addCardToDeck = useCallback(async (cardId: number, deckId: string, zone: 'main' | 'extra' | 'side' = 'main') => {
    setAddingToDeck(true);
    try {
      const res = await fetch(`/api/decks/${deckId}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card_id: cardId, zone, count: 1 }),
      });
      const data = await res.json();
      if (data.id || data.count) {
        const deck = decks.find(d => d.id === deckId);
        setToast({ message: `已添加到「${deck?.name || '卡组'}」`, type: "success" });
        setShowAddToDeckModal(null);
        fetchDecks(); // 刷新卡组列表更新数量
      } else {
        setToast({ message: data.error || "添加失败", type: "error" });
      }
    } catch (error) {
      console.error("添加卡片到卡组失败:", error);
      setToast({ message: "添加失败", type: "error" });
    }
    setAddingToDeck(false);
  }, [decks, fetchDecks]);

  // 打开添加到卡组弹窗
  const openAddToDeckModal = useCallback((e: React.MouseEvent, card: Card) => {
    e.stopPropagation();
    fetchDecks(); // 每次打开时刷新卡组列表
    setShowAddToDeckModal({ card });
  }, [fetchDecks]);

  // 初始化加载收藏数据
  useEffect(() => {
    fetchFolders();
    fetchFavoriteIds();
    fetchDecks(); // 也加载卡组列表
  }, [fetchFolders, fetchFavoriteIds, fetchDecks]);

  // 切换到收藏页时加载卡片
  useEffect(() => {
    if (activeTab === "collection") {
      fetchFavoriteCards(selectedFolderId || undefined);
    }
  }, [activeTab, selectedFolderId, fetchFavoriteCards]);

  // 无限滚动
  useEffect(() => {
    if (!hasSearched) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting && hasMore && !loading) fetchCards(false); },
      { threshold: 0.1 }
    );
    if (loaderRef.current) observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, fetchCards, hasSearched]);

  // 应用筛选
  const applyFilters = () => { setAppliedFilters(pendingFilters); setHasSearched(true); };

  // 清除筛选
  const clearFilters = () => {
    setPendingFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    setSearch("");
    setCards([]);
    setTotal(0);
    setHasSearched(false);
    router.replace("/cards", { scroll: false });
  };

  // 应用预设
  const applyPreset = (preset: typeof PRESET_FILTERS[0]) => {
    const f = preset.filter as Partial<typeof DEFAULT_FILTERS & { search?: string; atkRange?: [number, number]; levelRange?: [number, number] }>;
    const newFilters: typeof DEFAULT_FILTERS = {
      cardType: f.cardType || DEFAULT_FILTERS.cardType,
      subTypes: f.subTypes || DEFAULT_FILTERS.subTypes,
      attributes: f.attributes || DEFAULT_FILTERS.attributes,
      races: f.races || DEFAULT_FILTERS.races,
      archetypes: f.archetypes || DEFAULT_FILTERS.archetypes,
      abilities: f.abilities || DEFAULT_FILTERS.abilities,
      banlistOcg: f.banlistOcg || DEFAULT_FILTERS.banlistOcg,
      levels: f.levelRange ? [f.levelRange[0]] : DEFAULT_FILTERS.levels,
      linkValues: f.levelRange && f.subTypes?.includes("Link") ? [f.levelRange[0]] : DEFAULT_FILTERS.linkValues,
      pendulumScales: DEFAULT_FILTERS.pendulumScales,
      atkMin: f.atkRange ? f.atkRange[0] : DEFAULT_FILTERS.atkMin,
      atkMax: f.atkRange ? f.atkRange[1] : DEFAULT_FILTERS.atkMax,
      defMin: DEFAULT_FILTERS.defMin,
      defMax: DEFAULT_FILTERS.defMax,
    };
    setPendingFilters(newFilters);
    setAppliedFilters(newFilters);
    if (f.search) setSearch(f.search);
    setHasSearched(true);
  };

  // 弹窗导航
  const openCard = (card: Card, index: number) => { setSelectedCard(card); setSelectedIndex(index); };
  const goToPrevCard = () => { if (selectedIndex > 0) { setSelectedIndex(selectedIndex - 1); setSelectedCard(cards[selectedIndex - 1]); } };
  const goToNextCard = () => { if (selectedIndex < cards.length - 1) { setSelectedIndex(selectedIndex + 1); setSelectedCard(cards[selectedIndex + 1]); } };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f3eacb] font-sans p-3 sm:p-4 select-none relative overflow-x-hidden">
      <MagicCircleBackground />
      <Header activeTab={activeTab} onTabChange={setActiveTab} favoriteCount={favoriteCardIds.size} />

      <main className="max-w-7xl mx-auto flex flex-col xl:flex-row gap-6 relative z-10">
        {activeTab === "library" && (
          <FilterSidebar
            filters={pendingFilters}
            onFilterChange={(updates) => setPendingFilters(prev => ({ ...prev, ...updates }))}
            onApply={applyFilters}
            onClear={clearFilters}
            hasChanges={hasChanges}
            filterCount={filterCount}
          />
        )}

        <section className="flex-1">
          {/* ========== 卡牌书库 ========== */}
          {activeTab === "library" && (
            <>
              {/* 搜索栏 */}
              <div className="mb-4">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5c4002]" size={18} />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onKeyDown={handleSearchKeyDown}
                      placeholder={searchMode === "name" ? "搜索卡名..." : "搜索卡名或效果（回车搜索）..."}
                      className="w-full bg-black border-2 border-[#333] text-[#fff176] p-3 pl-12 text-base focus:outline-none focus:border-[#daa520] transition-colors placeholder-[#555]"
                    />
                  </div>
                  {/* 搜索模式切换 */}
                  <button
                    onClick={() => setSearchMode(searchMode === "name" ? "all" : "name")}
                    className={cn(
                      "px-3 border-2 text-sm font-bold transition-colors whitespace-nowrap",
                      searchMode === "name"
                        ? "bg-[#daa520]/20 border-[#daa520] text-[#daa520]"
                        : "bg-[#4a9eff]/20 border-[#4a9eff] text-[#4a9eff]"
                    )}
                    title={searchMode === "name" ? "当前: 仅搜卡名（实时搜索）" : "当前: 搜卡名+效果（回车搜索）"}
                  >
                    {searchMode === "name" ? "🏷️ 卡名" : "📜 全文"}
                  </button>
                </div>
              </div>

              {/* 未搜索时显示快捷入口 */}
              {!hasSearched ? (
            <div className="py-12 text-center">
              <Database size={48} className="mx-auto mb-4 text-[#333]" />
              <h2 className="text-2xl font-bold text-[#daa520] mb-3">开始搜索卡牌</h2>
              <p className="text-[#5c4002] text-base mb-8">输入卡名搜索，或选择快捷筛选</p>
              
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-3 max-w-3xl mx-auto">
                {PRESET_FILTERS.map(preset => (
                  <button
                    key={preset.id}
                    onClick={() => applyPreset(preset)}
                    className="bg-[#111] hover:bg-[#1a1a1a] border border-[#333] hover:border-[#daa520] p-4 transition-colors group"
                  >
                    <div className="text-2xl mb-2">{preset.icon}</div>
                    <div className="text-sm text-[#daa520] font-bold group-hover:text-[#fff176]">{preset.name}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* 结果统计 & 排序 */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-[#5c4002]">
                  共 <span className="text-[#daa520] font-bold">{total.toLocaleString()}</span> 张
                </span>
                <div className="flex items-center gap-2">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="h-9 text-sm bg-black text-[#daa520] border border-[#333] px-3 focus:outline-none focus:border-[#daa520]"
                  >
                    <option value="id">ID</option>
                    <option value="name_cn">卡名</option>
                    <option value="atk">ATK</option>
                    <option value="def">DEF</option>
                    <option value="level">等级</option>
                  </select>
                  <button
                    onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                    className="h-9 w-9 flex items-center justify-center text-base bg-black text-[#daa520] border border-[#333] hover:border-[#daa520]"
                  >
                    {sortOrder === "asc" ? "↑" : "↓"}
                  </button>
                </div>
              </div>

              {/* 卡片网格 */}
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {cards.map((card, index) => (
                  <CardItem 
                    key={card.id} 
                    card={card} 
                    onClick={() => openCard(card, index)}
                    isFavorited={favoriteCardIds.has(card.id)}
                    onToggleFavorite={(e) => { e.stopPropagation(); toggleFavorite(card.id); }}
                    onAddToDeck={openAddToDeckModal}
                  />
                ))}
              </div>

              {/* 加载更多 */}
              <div ref={loaderRef} className="py-8 text-center">
                {(loading || (search !== debouncedSearch && searchMode === "name")) && (
                  <div className="text-[#daa520] text-xs animate-pulse">&gt;&gt; 召唤更多卡牌...</div>
                )}
                {!loading && search === debouncedSearch && !hasMore && cards.length > 0 && (
                  <div className="text-[#333] text-xs">— 全部 {total.toLocaleString()} 张 —</div>
                )}
              </div>
              {/* 无结果提示（等搜索稳定后才显示，避免闪烁） */}
              {!loading && cards.length === 0 && hasSearched && search === debouncedSearch && (
                <div className="text-[#333] py-12 text-center">
                  <Database size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="font-bold">未找到匹配的卡牌</p>
                  {searchMode === "name" && (
                    <p className="text-sm mt-2 text-[#444]">试试切换到「📜 全文」模式搜索效果文字</p>
                  )}
                </div>
              )}
            </>
          )}
            </>
          )}

          {/* ========== 我的收藏 ========== */}
          {activeTab === "collection" && (
            <div>
              {/* 收藏夹列表 */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-[#daa520] flex items-center gap-2">
                    <Star size={20} /> 我的收藏
                    <span className="text-sm text-[#5c4002] font-normal ml-2">
                      共 {favoriteCards.length} 张
                    </span>
                  </h2>
                  <button
                    onClick={() => setShowNewFolderModal(true)}
                    className="px-3 py-2 text-xs font-bold border-2 border-[#333] text-[#5c4002] hover:border-[#daa520] hover:text-[#daa520] transition-colors flex items-center gap-1"
                  >
                    <Plus size={14} /> 新建收藏夹
                  </button>
                </div>

                {/* 收藏夹标签 */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <button
                    onClick={() => setSelectedFolderId(null)}
                    className={cn(
                      "px-4 py-2 text-sm font-bold border-2 transition-all",
                      selectedFolderId === null
                        ? "bg-[#daa520] border-[#daa520] text-black"
                        : "border-[#333] text-[#5c4002] hover:border-[#daa520] hover:text-[#daa520]"
                    )}
                  >
                    全部 ({favoriteFolders.reduce((sum, f) => sum + f.card_count, 0)})
                  </button>
                  {favoriteFolders.map(folder => (
                    <div key={folder.id} className="relative group">
                      <button
                        onClick={() => setSelectedFolderId(folder.id)}
                        className={cn(
                          "px-4 py-2 text-sm font-bold border-2 transition-all flex items-center gap-2",
                          selectedFolderId === folder.id
                            ? "bg-[#daa520] border-[#daa520] text-black"
                            : "border-[#333] text-[#5c4002] hover:border-[#daa520] hover:text-[#daa520]"
                        )}
                      >
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: folder.color }} />
                        {folder.name} ({folder.card_count})
                      </button>
                      {folder.id !== "00000000-0000-0000-0000-000000000001" && (
                        <button
                          onClick={() => deleteFolder(folder.id)}
                          className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 收藏的卡片 */}
              {loadingFavorites ? (
                <div className="py-12 text-center">
                  <Loader2 size={32} className="mx-auto mb-3 text-[#daa520] animate-spin" />
                  <p className="text-[#5c4002]">加载中...</p>
                </div>
              ) : favoriteCards.length === 0 ? (
                <div className="py-12 text-center">
                  <Star size={48} className="mx-auto mb-4 text-[#333]" />
                  <h3 className="text-lg font-bold text-[#5c4002] mb-2">还没有收藏的卡片</h3>
                  <p className="text-sm text-[#333]">在卡牌书库中点击 ⭐ 来收藏卡片</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {favoriteCards.map((fav, index) => {
                    // 转换为 Card 类型
                    const card: Card = {
                      id: fav.card_id,
                      name_cn: fav.name_cn ?? null,
                      name_jp: fav.name_jp ?? null,
                      name_en: fav.name_en ?? "Unknown",
                      card_type: fav.card_type ?? "Monster",
                      sub_type: fav.sub_type ?? null,
                      attribute: fav.attribute ?? null,
                      race: fav.race ?? null,
                      level: fav.level ?? null,
                      atk: fav.atk ?? null,
                      def: fav.def ?? null,
                      desc_en: fav.desc_en ?? "",
                      desc_jp: fav.desc_jp ?? null,
                      desc_cn: fav.desc_cn ?? null,
                      archetype: fav.archetype ?? null,
                      banlist_ocg: fav.banlist_ocg ?? null,
                      banlist_tcg: null,
                      scale: null,
                      linkval: null,
                    };
                    return (
                      <div key={`${fav.favorite_id}-${fav.card_id}`} className="group relative">
                        <CardItem
                          card={card}
                          onClick={() => {
                            setSelectedCard(card);
                            setSelectedIndex(index);
                          }}
                          isFavorited={true}
                          onToggleFavorite={(e) => { e.stopPropagation(); toggleFavorite(fav.card_id); }}
                        />
                        {/* 操作按钮组 */}
                        <div className="absolute bottom-2 left-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                          <button
                            onClick={(e) => { e.stopPropagation(); setShowMoveModal({ cardId: fav.card_id, currentFolderId: fav.folder_id }); }}
                            className="flex-1 py-1 text-xs bg-[#1a1a1a]/90 border border-[#333] text-[#daa520] hover:bg-[#daa520] hover:text-black transition-colors font-bold"
                            title="移动到其他收藏夹"
                          >
                            移动
                          </button>
                        </div>
                        {/* 收藏夹标识 */}
                        {fav.folder_name && fav.folder_color && (
                          <div 
                            className="absolute top-2 left-2 px-1.5 py-0.5 text-[10px] font-bold bg-black/70 border flex items-center gap-1 z-10"
                            style={{ borderColor: fav.folder_color, color: fav.folder_color }}
                          >
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: fav.folder_color }} />
                            {fav.folder_name}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ========== 卡组构筑（占位） ========== */}
          {activeTab === "deck" && (
            <div className="py-12 text-center">
              <Layout size={48} className="mx-auto mb-4 text-[#333]" />
              <h2 className="text-xl font-bold text-[#daa520] mb-2">卡组构筑</h2>
              <p className="text-[#5c4002]">功能开发中...</p>
            </div>
          )}
        </section>
      </main>

      {/* 新建收藏夹弹窗 */}
      {showNewFolderModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90" onClick={() => setShowNewFolderModal(false)}>
          <div className="bg-[#111] border-2 border-[#daa520] p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-[#daa520] mb-4 flex items-center gap-2">
              <FolderPlus size={20} /> 新建收藏夹
            </h3>
            <input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="收藏夹名称"
              className="w-full bg-black border-2 border-[#333] text-[#fff176] p-3 text-base focus:outline-none focus:border-[#daa520] mb-4"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && newFolderName.trim() && createFolder(newFolderName.trim(), newFolderColor)}
            />
            
            {/* 颜色选择器 */}
            <div className="mb-4">
              <div className="text-sm text-[#5c4002] mb-2">选择颜色</div>
              <div className="flex flex-wrap gap-2">
                {FOLDER_COLORS.map(color => (
                  <button
                    key={color.value}
                    onClick={() => setNewFolderColor(color.value)}
                    className={cn(
                      "w-8 h-8 rounded-full border-2 transition-all",
                      newFolderColor === color.value 
                        ? "border-white scale-110 shadow-lg" 
                        : "border-transparent hover:scale-105"
                    )}
                    style={{ backgroundColor: color.value }}
                    title={color.name}
                  />
                ))}
              </div>
            </div>
            
            {/* 预览 */}
            <div className="mb-4 p-3 bg-black/50 border border-[#333] flex items-center gap-3">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: newFolderColor }} />
              <span className="text-[#daa520] font-bold">{newFolderName || "收藏夹名称"}</span>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => { setShowNewFolderModal(false); setNewFolderName(""); setNewFolderColor("#daa520"); }}
                className="flex-1 py-2 text-sm font-bold border-2 border-[#333] text-[#5c4002] hover:border-[#daa520] hover:text-[#daa520]"
              >
                取消
              </button>
              <button
                onClick={() => newFolderName.trim() && createFolder(newFolderName.trim(), newFolderColor)}
                disabled={!newFolderName.trim()}
                className={cn(
                  "flex-1 py-2 text-sm font-bold border-2 transition-all",
                  newFolderName.trim()
                    ? "bg-[#daa520] border-[#daa520] text-black hover:bg-[#fff176]"
                    : "border-[#333] text-[#333] cursor-not-allowed"
                )}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 移动到收藏夹弹窗 */}
      {showMoveModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90" onClick={() => setShowMoveModal(null)}>
          <div className="bg-[#111] border-2 border-[#daa520] p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-[#daa520] mb-4">移动到收藏夹</h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {favoriteFolders.map(folder => (
                <button
                  key={folder.id}
                  onClick={() => moveToFolder(showMoveModal.cardId, folder.id)}
                  disabled={folder.id === showMoveModal.currentFolderId}
                  className={cn(
                    "w-full px-4 py-3 text-left flex items-center gap-3 border-2 transition-all",
                    folder.id === showMoveModal.currentFolderId
                      ? "border-[#333] text-[#333] cursor-not-allowed"
                      : "border-[#333] hover:border-[#daa520] text-[#daa520]"
                  )}
                >
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: folder.color }} />
                  <span className="font-bold">{folder.name}</span>
                  <span className="text-[#5c4002] text-sm ml-auto">({folder.card_count})</span>
                  {folder.id === showMoveModal.currentFolderId && (
                    <span className="text-xs text-[#333]">当前</span>
                  )}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowMoveModal(null)}
              className="w-full mt-4 py-2 text-sm font-bold border-2 border-[#333] text-[#5c4002] hover:border-[#daa520] hover:text-[#daa520]"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 弹窗 */}
      {selectedCard && (
        <CardDetailModal
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onPrev={goToPrevCard}
          onNext={goToNextCard}
          hasPrev={selectedIndex > 0}
          hasNext={selectedIndex < cards.length - 1}
          isFavorited={favoriteCardIds.has(selectedCard.id)}
          currentFolderId={favoriteCardFolders.get(selectedCard.id) || null}
          onToggleFavorite={() => toggleFavorite(selectedCard.id)}
          folders={favoriteFolders}
          onMoveToFolder={(folderId) => moveToFolder(selectedCard.id, folderId)}
          onTagClick={(type, value) => {
            // 关闭弹窗并跳转筛选
            setSelectedCard(null);
            if (type === "race") {
              const newFilters = { ...DEFAULT_FILTERS, races: [value] };
              setPendingFilters(newFilters);
              setAppliedFilters(newFilters);
              setHasSearched(true);
            } else if (type === "archetype") {
              const newFilters = { ...DEFAULT_FILTERS, archetypes: [value] };
              setPendingFilters(newFilters);
              setAppliedFilters(newFilters);
              setHasSearched(true);
            }
          }}
        />
      )}
      
      {/* 添加到卡组弹窗 */}
      {showAddToDeckModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90" onClick={() => setShowAddToDeckModal(null)}>
          <div className="bg-[#111] border-2 border-green-600 p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-green-400 mb-2 flex items-center gap-2">
              <Plus size={20} /> 添加到卡组
            </h3>
            <p className="text-sm text-[#5c4002] mb-4 truncate">
              {showAddToDeckModal.card.name_cn || showAddToDeckModal.card.name_en}
            </p>
            
            {decks.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-[#5c4002] mb-4">还没有卡组</p>
                <Link href="/decks" className="px-4 py-2 bg-green-600 text-black font-bold hover:bg-green-500 transition-colors inline-block">
                  去创建卡组 →
                </Link>
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {decks.map(deck => (
                  <button
                    key={deck.id}
                    onClick={() => addCardToDeck(showAddToDeckModal.card.id, deck.id)}
                    disabled={addingToDeck}
                    className="w-full px-4 py-3 text-left flex items-center justify-between border-2 border-[#333] hover:border-green-600 text-green-400 hover:bg-green-900/20 transition-all disabled:opacity-50"
                  >
                    <span className="font-bold truncate">{deck.name}</span>
                    <span className="text-[#5c4002] text-sm flex-shrink-0 ml-2">
                      {deck.card_count || 0}张
                    </span>
                  </button>
                ))}
              </div>
            )}
            
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setShowAddToDeckModal(null)}
                className="flex-1 py-2 text-sm font-bold border-2 border-[#333] text-[#5c4002] hover:border-green-600 hover:text-green-400"
              >
                取消
              </button>
              <Link
                href="/decks"
                className="flex-1 py-2 text-sm font-bold border-2 border-green-600 text-green-400 hover:bg-green-600 hover:text-black text-center transition-colors"
              >
                管理卡组
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Toast 提示 */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* 页脚 */}
      <footer className="mt-12 max-w-7xl mx-auto border-t-4 border-black py-6 px-4 bg-[#0d0d0d]">
        <div className="flex justify-between items-center text-[8px] text-[#333] font-bold">
          <div className="flex gap-6">
            <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 bg-[#daa520] animate-pulse" /> 系统在线</span>
            <span className="opacity-50">Mimi Duel Archive v1.0</span>
          </div>
          <p>© 咪咪的决斗世界</p>
        </div>
      </footer>

      <style jsx global>{`
        @keyframes holoSweep {
          0% { transform: translate(-150%, -150%) rotate(45deg); opacity: 0; }
          20% { opacity: 0.4; }
          40% { transform: translate(150%, 150%) rotate(45deg); opacity: 0; }
          100% { transform: translate(150%, 150%) rotate(45deg); opacity: 0; }
        }
        @keyframes smoothAppear {
          0% { opacity: 0; transform: scale(0.95) translateY(10px); filter: blur(4px); }
          100% { opacity: 1; transform: scale(1) translateY(0); filter: blur(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes starPop {
          0% { transform: scale(0.5); opacity: 0; }
          50% { transform: scale(1.3); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes starGlow {
          0%, 100% { filter: drop-shadow(0 0 2px #daa520); }
          50% { filter: drop-shadow(0 0 8px #fff176) drop-shadow(0 0 12px #daa520); }
        }
        .favorite-animate {
          animation: starPop 0.3s ease-out, starGlow 1s ease-in-out;
        }
        @keyframes cardReveal {
          0% { transform: scale(0.3) rotateY(180deg); opacity: 0; filter: blur(20px); }
          50% { transform: scale(1.05) rotateY(0deg); opacity: 1; filter: blur(0); }
          100% { transform: scale(1) rotateY(0deg); opacity: 1; filter: blur(0); }
        }
        @keyframes glow {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.1); }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%) translateY(-100%) rotate(45deg); }
          50% { transform: translateX(100%) translateY(100%) rotate(45deg); }
          100% { transform: translateX(100%) translateY(100%) rotate(45deg); }
        }
        @keyframes scanLine {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(400%); }
        }
      `}</style>
    </div>
  );
}
