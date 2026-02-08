import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// 模拟的连锁步骤
const comboSteps = [
  { step: 1, card: "烙印融合", action: "发动", description: "从卡组送墓阿不思的落胤和深渊兽 赫界龙" },
  { step: 2, card: "阿不思的落胤", action: "效果", description: "被送墓时，检索烙印相关卡片" },
  { step: 3, card: "深渊兽 赫界龙", action: "效果", description: "除外墓地的光/暗属性怪兽特殊召唤" },
];

// 场地区域组件
function FieldZone({ label, cards = [], className = "" }: { label: string; cards?: number[]; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <div className="text-[10px] text-gray-500 mb-1 text-center">{label}</div>
      <div className="grid grid-cols-5 gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="aspect-[59/86] rounded border border-[#333] bg-[#1a1a1a]/50 flex items-center justify-center"
          >
            {cards[i] ? (
              <Image
                src={`/card-images/cn/${cards[i]}.webp`}
                alt=""
                width={40}
                height={58}
                className="object-contain"
              />
            ) : (
              <span className="text-[10px] text-gray-600">{i + 1}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ComboPage() {
  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      {/* 标题区域 */}
      <div className="bg-[#1a1a1a] border-b border-[#333]">
        <div className="container py-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <span className="text-2xl">⚡</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">连锁模拟器</h1>
              <p className="text-gray-400 text-sm">学习展开路线，模拟连锁流程</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container py-6">
        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          {/* 左侧：决斗场地 */}
          <div className="space-y-6">
            {/* 决斗场地 */}
            <div className="p-6 rounded-2xl bg-gradient-to-b from-[#1a2a1a] to-[#0a150a] border border-[#2a3a2a]">
              <div className="text-center mb-4">
                <span className="text-xs text-gray-500">对手场地</span>
              </div>

              {/* 对手场地 */}
              <div className="space-y-2 opacity-50">
                <FieldZone label="魔法/陷阱区" />
                <FieldZone label="怪兽区" />
              </div>

              {/* 中间线 */}
              <div className="my-6 flex items-center gap-4">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#333] to-transparent" />
                <span className="text-xs text-gray-500">FIELD</span>
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#333] to-transparent" />
              </div>

              {/* 己方场地 */}
              <div className="space-y-2">
                <FieldZone label="怪兽区" cards={[14558127]} />
                <FieldZone label="魔法/陷阱区" cards={[44362883]} />
              </div>

              {/* 手牌区 */}
              <div className="mt-6 pt-4 border-t border-[#2a3a2a]">
                <div className="text-[10px] text-gray-500 mb-2 text-center">手牌</div>
                <div className="flex justify-center gap-2">
                  {[14558127, 23434538, 97268402, 24224830, 10045474].map((id, i) => (
                    <div
                      key={i}
                      className="w-12 h-[70px] rounded border-2 border-yellow-500/30 bg-[#1a1a1a] overflow-hidden hover:scale-110 hover:z-10 transition-transform cursor-pointer"
                    >
                      <Image
                        src={`/card-images/cn/${id}.webp`}
                        alt=""
                        width={48}
                        height={70}
                        className="object-contain"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 控制面板 */}
            <div className="flex gap-2">
              <Button className="flex-1 bg-[#1a1a1a] border border-[#333] hover:bg-[#252525]">
                ⏮️ 上一步
              </Button>
              <Button className="flex-1 bg-gradient-to-r from-yellow-500 to-orange-500 text-black font-semibold">
                ▶️ 执行
              </Button>
              <Button className="flex-1 bg-[#1a1a1a] border border-[#333] hover:bg-[#252525]">
                ⏭️ 下一步
              </Button>
              <Button variant="outline" className="border-[#333]">
                🔄 重置
              </Button>
            </div>
          </div>

          {/* 右侧：连锁步骤 */}
          <div className="space-y-4">
            {/* 搜索卡片 */}
            <div className="p-4 rounded-xl bg-[#1a1a1a] border border-[#333]">
              <h3 className="text-sm font-medium text-gray-400 mb-3">添加卡片</h3>
              <Input 
                placeholder="搜索卡片名称..." 
                className="bg-[#252525] border-[#333] text-white"
              />
              <div className="mt-3 space-y-2">
                {["灰流丽", "增殖的G", "无限泡影"].map((name) => (
                  <button
                    key={name}
                    className="w-full text-left px-3 py-2 rounded-lg bg-[#252525] hover:bg-[#333] text-sm text-gray-300 transition-colors"
                  >
                    🃏 {name}
                  </button>
                ))}
              </div>
            </div>

            {/* 连锁步骤 */}
            <div className="p-4 rounded-xl bg-[#1a1a1a] border border-[#333]">
              <h3 className="text-sm font-medium text-gray-400 mb-3">连锁步骤</h3>
              
              <div className="space-y-3">
                {comboSteps.map((step, i) => (
                  <div
                    key={step.step}
                    className={`p-3 rounded-lg border transition-all ${
                      i === 0
                        ? "bg-yellow-500/10 border-yellow-500/30"
                        : "bg-[#252525] border-[#333]"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        i === 0 ? "bg-yellow-500 text-black" : "bg-[#333] text-gray-400"
                      }`}>
                        {step.step}
                      </span>
                      <span className="text-sm font-medium text-white">{step.card}</span>
                      <span className="text-xs text-gray-500">{step.action}</span>
                    </div>
                    <p className="text-xs text-gray-400 ml-8">{step.description}</p>
                  </div>
                ))}
              </div>

              {comboSteps.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <p>📭 暂无步骤</p>
                  <p className="text-sm mt-1">点击手牌或场上卡片开始</p>
                </div>
              )}
            </div>

            {/* 选择 Combo */}
            <div className="p-4 rounded-xl bg-[#1a1a1a] border border-[#333]">
              <h3 className="text-sm font-medium text-gray-400 mb-3">预设展开</h3>
              <div className="space-y-2">
                {["基础单卡展开 (阿鲁伯)", "双卡展开 (烙印融合+手坑)", "三卡终端盘面"].map((combo) => (
                  <button
                    key={combo}
                    className="w-full text-left px-3 py-2 rounded-lg bg-[#252525] hover:bg-[#333] text-sm text-gray-300 transition-colors"
                  >
                    ⚡ {combo}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
