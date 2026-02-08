"use client";

import Link from "next/link";
import { Database, Trophy, Zap, Skull, Shield, Star, Wand2, Sparkles } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f3eacb] relative overflow-hidden">
      {/* 魔法阵背景 */}
      <div className="fixed inset-0 pointer-events-none flex items-center justify-center opacity-[0.06] z-0">
        <div className="w-[800px] h-[800px] border-[16px] border-[#daa520] rounded-full border-dashed animate-[spin_60s_linear_infinite]" />
        <div className="absolute w-[600px] h-[600px] border-[8px] border-[#daa520] rounded-full animate-[spin_40s_linear_infinite_reverse]" />
        <div className="absolute w-[400px] h-[400px] border-[4px] border-[#daa520] rounded-full border-dotted animate-[spin_20s_linear_infinite]" />
      </div>

      <div className="max-w-5xl mx-auto px-4 py-12 relative z-10">
        {/* Hero */}
        <div className="text-center mb-16">
          <div className="inline-block mb-6">
            <div className="relative p-0.5 bg-gradient-to-r from-[#5c4002] via-[#daa520] to-[#5c4002]">
              <div className="bg-[#0d0d0d] px-8 py-6 border-2 border-black">
                <div className="flex items-center justify-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-[#1a1a1a] border-2 border-[#daa520] flex items-center justify-center">
                    <Wand2 size={20} className="text-[#daa520] animate-pulse" />
                  </div>
                  <h1 className="text-3xl md:text-5xl font-black italic text-transparent bg-clip-text bg-gradient-to-b from-[#fff176] to-[#b8860b] uppercase tracking-tighter">
                    咪咪的决斗卡牌库
                  </h1>
                </div>
                <p className="text-[#5c4002] text-[10px] uppercase tracking-[4px] flex items-center justify-center gap-2">
                  <Sparkles size={10} /> MIMI_DUEL_ARCHIVE_V2.0
                </p>
              </div>
            </div>
          </div>
          
          <p className="text-[#5c4002] text-sm max-w-xl mx-auto leading-relaxed">
            收录全部 <span className="text-[#daa520] font-bold">14,149</span> 张决斗怪兽卡牌。
            支持卡牌检索、卡组构筑、连锁模拟等功能。
          </p>
        </div>
        
        {/* Feature Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          <Link href="/cards" className="group">
            <div className="bg-[#111] border-4 border-black p-6 transition-all group-hover:-translate-y-2 group-hover:shadow-[8px_8px_0px_0px_rgba(218,165,32,0.3)] h-full">
              <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-[#daa520] to-transparent" />
              <div className="flex flex-col items-center text-center">
                <div className="w-14 h-14 bg-[#daa520] border-4 border-black flex items-center justify-center mb-4">
                  <Database size={28} className="text-black" />
                </div>
                <h3 className="text-lg font-black text-[#daa520] uppercase mb-2">卡牌图鉴</h3>
                <p className="text-[11px] text-[#5c4002]">
                  浏览全部卡牌数据<br/>
                  支持多条件筛选
                </p>
                <div className="mt-4 text-[9px] text-[#333] bg-black px-2 py-1 font-bold">
                  14,149 CARDS
                </div>
              </div>
            </div>
          </Link>
          
          <Link href="/decks" className="group">
            <div className="bg-[#111] border-4 border-black p-6 transition-all group-hover:-translate-y-2 group-hover:shadow-[8px_8px_0px_0px_rgba(79,195,247,0.3)] h-full">
              <div className="flex flex-col items-center text-center">
                <div className="w-14 h-14 bg-[#4fc3f7] border-4 border-black flex items-center justify-center mb-4">
                  <Trophy size={28} className="text-black" />
                </div>
                <h3 className="text-lg font-black text-[#4fc3f7] uppercase mb-2">卡组集合</h3>
                <p className="text-[11px] text-[#5c4002]">
                  创建和管理卡组<br/>
                  分享卡组构筑
                </p>
                <div className="mt-4 text-[9px] text-[#333] bg-black px-2 py-1 font-bold">
                  BUILD YOUR DECK
                </div>
              </div>
            </div>
          </Link>
          
          <Link href="/combo" className="group">
            <div className="bg-[#111] border-4 border-black p-6 transition-all group-hover:-translate-y-2 group-hover:shadow-[8px_8px_0px_0px_rgba(240,98,146,0.3)] h-full">
              <div className="flex flex-col items-center text-center">
                <div className="w-14 h-14 bg-[#f06292] border-4 border-black flex items-center justify-center mb-4">
                  <Zap size={28} className="text-white" />
                </div>
                <h3 className="text-lg font-black text-[#f06292] uppercase mb-2">COMBO</h3>
                <p className="text-[11px] text-[#5c4002]">
                  连锁效果模拟<br/>
                  学习卡组展开
                </p>
                <div className="mt-4 text-[9px] text-[#333] bg-black px-2 py-1 font-bold">
                  CHAIN SIMULATOR
                </div>
              </div>
            </div>
          </Link>
        </div>
        
        {/* Stats */}
        <div className="relative p-0.5 bg-gradient-to-r from-[#5c4002] via-[#f06292] to-[#5c4002] mb-12">
          <div className="bg-[#0d0d0d] border-2 border-black">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Skull size={14} className="text-orange-400" />
                  <span className="text-[9px] text-[#5c4002] uppercase font-bold">Monsters</span>
                </div>
                <p className="text-2xl font-black text-orange-400">9,323</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Star size={14} className="text-teal-400" />
                  <span className="text-[9px] text-[#5c4002] uppercase font-bold">Spells</span>
                </div>
                <p className="text-2xl font-black text-teal-400">2,795</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Shield size={14} className="text-pink-400" />
                  <span className="text-[9px] text-[#5c4002] uppercase font-bold">Traps</span>
                </div>
                <p className="text-2xl font-black text-pink-400">2,031</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Zap size={14} className="text-[#daa520]" />
                  <span className="text-[9px] text-[#5c4002] uppercase font-bold">Series</span>
                </div>
                <p className="text-2xl font-black text-[#daa520]">500+</p>
              </div>
            </div>
          </div>
        </div>
        
        {/* CTA */}
        <div className="text-center">
          <Link href="/cards">
            <button className="bg-[#daa520] text-black px-8 py-3 font-black uppercase text-sm border-4 border-black shadow-[4px_4px_0px_#5c4002] hover:shadow-[6px_6px_0px_#5c4002] hover:-translate-y-1 transition-all">
              开始探索 →
            </button>
          </Link>
        </div>
      </div>

      {/* 页脚 */}
      <footer className="border-t-4 border-black py-6 px-4 bg-[#0d0d0d] mt-12">
        <div className="max-w-5xl mx-auto flex justify-between items-center text-[8px] text-[#333] font-bold">
          <div className="flex gap-6">
            <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 bg-[#daa520] animate-pulse" /> 系统在线</span>
            <span className="opacity-50">Mimi Duel Archive v1.0</span>
          </div>
          <p>© 咪咪的决斗世界</p>
        </div>
      </footer>

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
