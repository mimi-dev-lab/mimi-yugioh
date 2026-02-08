"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { Card } from "@/lib/supabase";

type Language = "cn" | "jp" | "en";

// 语言配置
const langConfig: Record<Language, { label: string; flag: string; color: string }> = {
  cn: { label: "中文", flag: "🇨🇳", color: "bg-red-500" },
  jp: { label: "日本語", flag: "🇯🇵", color: "bg-pink-500" },
  en: { label: "English", flag: "🇺🇸", color: "bg-blue-500" },
};

// 属性配置
const attributeConfig: Record<string, { icon: string; color: string; bg: string; label: Record<Language, string> }> = {
  LIGHT: { icon: "☀️", color: "text-yellow-400", bg: "bg-yellow-500/20 border-yellow-500/50", label: { cn: "光", jp: "光", en: "LIGHT" } },
  DARK: { icon: "🌙", color: "text-purple-400", bg: "bg-purple-500/20 border-purple-500/50", label: { cn: "暗", jp: "闇", en: "DARK" } },
  FIRE: { icon: "🔥", color: "text-red-400", bg: "bg-red-500/20 border-red-500/50", label: { cn: "炎", jp: "炎", en: "FIRE" } },
  WATER: { icon: "💧", color: "text-blue-400", bg: "bg-blue-500/20 border-blue-500/50", label: { cn: "水", jp: "水", en: "WATER" } },
  WIND: { icon: "🌪️", color: "text-emerald-400", bg: "bg-emerald-500/20 border-emerald-500/50", label: { cn: "风", jp: "風", en: "WIND" } },
  EARTH: { icon: "🌍", color: "text-amber-400", bg: "bg-amber-500/20 border-amber-500/50", label: { cn: "地", jp: "地", en: "EARTH" } },
  DIVINE: { icon: "✨", color: "text-orange-400", bg: "bg-orange-500/20 border-orange-500/50", label: { cn: "神", jp: "神", en: "DIVINE" } },
};

// 种族翻译
const raceTranslate: Record<Language, Record<string, string>> = {
  cn: {
    "Zombie": "不死族", "Dragon": "龙族", "Spellcaster": "魔法使族",
    "Warrior": "战士族", "Beast-Warrior": "兽战士族", "Beast": "兽族",
    "Winged Beast": "鸟兽族", "Fiend": "恶魔族", "Fairy": "天使族",
    "Insect": "昆虫族", "Dinosaur": "恐龙族", "Reptile": "爬虫族",
    "Fish": "鱼族", "Sea Serpent": "海龙族", "Aqua": "水族",
    "Pyro": "炎族", "Thunder": "雷族", "Rock": "岩石族",
    "Plant": "植物族", "Machine": "机械族", "Psychic": "念动力族",
    "Divine-Beast": "幻神兽族", "Wyrm": "幻龙族", "Cyberse": "电子界族",
    "Illusion": "幻想魔族",
  },
  jp: {
    "Zombie": "アンデット族", "Dragon": "ドラゴン族", "Spellcaster": "魔法使い族",
    "Warrior": "戦士族", "Beast-Warrior": "獣戦士族", "Beast": "獣族",
    "Winged Beast": "鳥獣族", "Fiend": "悪魔族", "Fairy": "天使族",
    "Insect": "昆虫族", "Dinosaur": "恐竜族", "Reptile": "爬虫類族",
    "Fish": "魚族", "Sea Serpent": "海竜族", "Aqua": "水族",
    "Pyro": "炎族", "Thunder": "雷族", "Rock": "岩石族",
    "Plant": "植物族", "Machine": "機械族", "Psychic": "サイキック族",
    "Divine-Beast": "幻神獣族", "Wyrm": "幻竜族", "Cyberse": "サイバース族",
    "Illusion": "イリュージョン族",
  },
  en: {},
};

// 卡片类型边框颜色
const cardTypeGlow: Record<string, string> = {
  "Monster": "shadow-orange-500/30",
  "Spell": "shadow-teal-500/30",
  "Trap": "shadow-pink-500/30",
};

// UI 文本
const uiText: Record<Language, { back: string; addToDeck: string; share: string; effect: string; cardId: string; level: string; noEffect: string }> = {
  cn: { back: "← 返回卡牌图鉴", addToDeck: "📋 加入卡组", share: "🔗 分享", effect: "📜 卡片效果", cardId: "卡片 ID", level: "等级", noEffect: "暂无效果文本" },
  jp: { back: "← カード図鑑に戻る", addToDeck: "📋 デッキに追加", share: "🔗 共有", effect: "📜 カード効果", cardId: "カード ID", level: "レベル", noEffect: "効果テキストなし" },
  en: { back: "← Back to Cards", addToDeck: "📋 Add to Deck", share: "🔗 Share", effect: "📜 Card Effect", cardId: "Card ID", level: "Level", noEffect: "No effect text available" },
};

export function CardDetail({ card }: { card: Card }) {
  const [lang, setLang] = useState<Language>("cn");

  const attr = card.attribute ? attributeConfig[card.attribute] : null;
  const glowClass = cardTypeGlow[card.card_type] || "shadow-gray-500/30";
  const ui = uiText[lang];

  // 获取当前语言的数据
  const getName = () => {
    if (lang === "cn") return card.name_cn || card.name_en;
    if (lang === "jp") return card.name_jp || card.name_en;
    return card.name_en;
  };

  const getDesc = () => {
    if (lang === "cn") return card.desc_cn || card.desc_en;
    if (lang === "jp") return card.desc_jp || card.desc_en;
    return card.desc_en;
  };

  const getRace = () => {
    if (!card.race) return null;
    if (lang === "en") return card.race;
    return raceTranslate[lang][card.race] || card.race;
  };

  // 其他语言的卡名
  const otherNames = [
    lang !== "cn" && card.name_cn,
    lang !== "jp" && card.name_jp,
    lang !== "en" && card.name_en,
  ].filter(Boolean);

  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      {/* 顶部导航 */}
      <div className="bg-[#1a1a1a] border-b border-[#333]">
        <div className="container py-3">
          <div className="flex items-center justify-between">
            <Link href="/cards">
              <Button variant="ghost" className="text-gray-400 hover:text-white hover:bg-[#252525]">
                {ui.back}
              </Button>
            </Link>

            {/* 语言切换 */}
            <div className="flex items-center gap-1 p-1 bg-[#252525] rounded-xl">
              {(Object.keys(langConfig) as Language[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    lang === l
                      ? `${langConfig[l].color} text-white shadow-lg`
                      : "text-gray-400 hover:text-white hover:bg-[#333]"
                  }`}
                >
                  <span>{langConfig[l].flag}</span>
                  <span className="hidden sm:inline">{langConfig[l].label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="container py-8">
        <div className="grid lg:grid-cols-[400px_1fr] gap-8">
          {/* 左侧：卡图 */}
          <div className="space-y-4">
            <div className={`relative aspect-[59/86] rounded-xl overflow-hidden bg-[#1a1a1a] shadow-2xl ${glowClass}`}>
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none z-10" />
              
              <Image
                src={`/card-images/${lang}/${card.id}.${lang === 'en' ? 'jpg' : 'webp'}`}
                alt={getName()}
                fill
                className="object-contain"
                sizes="400px"
                loading="eager"
                onError={(e) => {
                  // 如果 jpg 失败，尝试 webp（转换完成后）
                  const target = e.target as HTMLImageElement;
                  if (target.src.endsWith('.jpg')) {
                    target.src = target.src.replace('.jpg', '.webp');
                  }
                }}
              />

              <div className={`absolute top-3 right-3 px-2 py-1 rounded-md text-xs font-medium ${langConfig[lang].color} text-white shadow-lg`}>
                {langConfig[lang].flag} {langConfig[lang].label}
              </div>
            </div>

            <div className="flex gap-2">
              <Button className="flex-1 bg-[#1a1a1a] border border-[#333] hover:bg-[#252525] text-white">
                {ui.addToDeck}
              </Button>
              <Button className="flex-1 bg-[#1a1a1a] border border-[#333] hover:bg-[#252525] text-white">
                {ui.share}
              </Button>
            </div>
          </div>

          {/* 右侧：卡片信息 */}
          <div className="space-y-6">
            {/* 卡名 */}
            <div>
              <h1 className="text-4xl font-bold text-white">{getName()}</h1>
              <div className="flex gap-4 mt-2 text-gray-500 flex-wrap">
                {otherNames.map((name, i) => (
                  <span key={i} className="text-sm">{name}</span>
                ))}
              </div>
            </div>

            {/* 属性和类型标签 */}
            <div className="flex flex-wrap gap-3">
              {attr && (
                <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${attr.bg}`}>
                  <span className="text-xl">{attr.icon}</span>
                  <span className={`font-medium ${attr.color}`}>{attr.label[lang]}</span>
                </div>
              )}
              
              {getRace() && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500/20 border border-blue-500/50">
                  <span className="text-xl">👤</span>
                  <span className="font-medium text-blue-400">{getRace()}</span>
                </div>
              )}

              {card.level && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-500/20 border border-yellow-500/50">
                  <span className="text-yellow-400 font-bold">
                    {"★".repeat(Math.min(card.level, 12))}
                  </span>
                  <span className="text-yellow-400 font-medium">{ui.level} {card.level}</span>
                </div>
              )}

              {card.sub_type && (
                <div className="px-4 py-2 rounded-lg bg-[#1a1a1a] border border-[#333]">
                  <span className="text-gray-300">{card.sub_type}</span>
                </div>
              )}
            </div>

            {/* ATK/DEF */}
            {card.atk !== null && (
              <div className="flex gap-8">
                <div className="text-center">
                  <div className="text-sm text-gray-500 mb-1">ATK</div>
                  <div className="text-4xl font-bold text-red-400">{card.atk}</div>
                </div>
                {card.def !== null && (
                  <div className="text-center">
                    <div className="text-sm text-gray-500 mb-1">DEF</div>
                    <div className="text-4xl font-bold text-blue-400">{card.def}</div>
                  </div>
                )}
              </div>
            )}

            {/* 效果文本 */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                {ui.effect}
              </h2>
              
              <div className="p-5 rounded-xl bg-[#1a1a1a] border border-[#333]">
                <p className="text-gray-200 leading-relaxed whitespace-pre-line text-base">
                  {getDesc() || ui.noEffect}
                </p>
              </div>
            </div>

            {/* 卡片 ID */}
            <div className="pt-4 border-t border-[#222]">
              <span className="text-sm text-gray-500">
                {ui.cardId}: <code className="px-2 py-1 bg-[#1a1a1a] rounded text-gray-400">{card.id}</code>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
