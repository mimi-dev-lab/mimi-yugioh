import { Suspense } from "react";
import { AncientLedgerClient } from "./ancient-ledger-client";

function LoadingState() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-6 border-4 border-[#daa520] border-dashed rounded-full animate-spin" />
        <div className="text-[#daa520] text-sm animate-pulse font-mono space-y-1">
          <p>&gt;&gt; 正在激活魔法阵...</p>
          <p>&gt;&gt; 连接决斗者档案库...</p>
        </div>
      </div>
    </div>
  );
}

export default function CardsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <AncientLedgerClient />
    </Suspense>
  );
}
