import { useState, useEffect } from 'react';
import { SketchyComboFlow } from '../components/ComboVisualizer';

interface ComboData {
  name: string;
  startingHand: string[];
  steps: {
    card: string;
    action: string;
    level?: number;
    from?: string[];
    searchTarget?: string;
    reviveTarget?: string;
    note?: string;
    branch?: string;
  }[];
  finalBoard: {
    monsters: string[];
    spellTrap: string[];
    disruptions: number;
  };
}

export default function ComboTestPage() {
  const [combo, setCombo] = useState<ComboData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/data/combos/white-forest-centurion.json')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load combo data');
        return res.json();
      })
      .then(data => {
        setCombo(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-gray-400">加载中...</div>
      </div>
    );
  }

  if (error || !combo) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-red-400">加载失败: {error}</div>
      </div>
    );
  }

  return (
    <div className="py-8">
      <h1 className="text-2xl font-bold text-white mb-6 text-center">
        ✏️ 手绘风格 Combo 展示测试
      </h1>
      
      <SketchyComboFlow combo={combo} />
    </div>
  );
}
