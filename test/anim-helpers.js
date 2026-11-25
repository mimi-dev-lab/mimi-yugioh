// 动画计划的测试辅助：某一刻每张卡在哪、某个文字元素这一刻写的什么（不开浏览器；和合成页里的引擎同一份 valueAt）。只给测试用，不进 src/。
import { ENGINE_SOURCE } from '../src/anim-engine.js';

export function frameAt(plan, t) {
  const { valueAt } = new Function(`${ENGINE_SOURCE}; return { valueAt };`)();
  const read = (id, prop, dflt) => {
    const init = plan.init[id]?.[prop] ?? dflt;
    return plan.tracks[id]?.[prop] ? valueAt(plan.tracks[id][prop], t, init, prop === 'z' || prop === 'text') : init;
  };
  return plan.instances.map((inst) => ({
    id: inst.id, code: inst.code, md: inst.md,
    x: read(inst.id, 'x', 0), y: read(inst.id, 'y', 0), opacity: read(inst.id, 'opacity', 1), z: read(inst.id, 'z', 10),
    rotation: read(`${inst.id}a`, 'rotation', 0), tilt: read(`${inst.id}a`, 'scale', 1), tint: read(`${inst.id}t`, 'opacity', 0), tb: read(`${inst.id}k`, 'opacity', 0), back: read(`${inst.id}b`, 'opacity', 0), name: read(`${inst.id}n`, 'opacity', 1),
  }));
}
export const textAt = (plan, id, t) => {
  const { valueAt } = new Function(`${ENGINE_SOURCE}; return { valueAt };`)();
  return plan.tracks[id]?.text ? valueAt(plan.tracks[id].text, t, plan.init[id]?.text, true) : plan.init[id]?.text;
};
