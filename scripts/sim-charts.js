// 模拟报告的图：手写 SVG（不加依赖），浅色底，类别色按固定顺序取（颜色过了 dataviz 的校验脚本），每条线在末端直接标名字、另有图例；数字另在 results.md 的表里。
const SURFACE = '#fcfcfb';
const INK = '#0b0b0b';
const INK2 = '#52514e';
const GRID = '#e4e3df';
export const MAIN_COLORS = { full: '#2a78d6', random: '#eb6834', game8: '#1baf7a' };
export const ABLATION_COLORS = { full: '#2a78d6', 'no-quiz': '#eda100', 'no-review': '#e87ba4', 'no-weak': '#6250d6' };
const FONT = 'font-family="-apple-system, \'PingFang SC\', \'Noto Sans CJK SC\', sans-serif"';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// 小多图：每个画像一格，横轴天数、纵轴基准手平均总分。panels：[{ title, series: [{ id, name, points: [{ day, mean, lo, hi }] }] }]
export function curvesSvg({ title, subtitle, panels, colors, yMax = 120, threshold }) {
  const W = 300; const H = 230; const pad = { l: 40, r: 70, t: 34, b: 34 };
  const width = W * panels.length; const height = H + 70;
  const days = Math.max(...panels.flatMap((p) => p.series.flatMap((s) => s.points.map((q) => q.day))));
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ${FONT}>`;
  svg += `<rect width="100%" height="100%" fill="${SURFACE}"/>`;
  svg += `<text x="12" y="22" font-size="15" font-weight="600" fill="${INK}">${esc(title)}</text>`;
  if (subtitle) svg += `<text x="12" y="40" font-size="11" fill="${INK2}">${esc(subtitle)}</text>`;
  // 图例：一行，在标题下
  let lx = 12;
  for (const s of panels[0].series) {
    svg += `<rect x="${lx}" y="50" width="14" height="3" rx="1.5" fill="${colors[s.id]}"/><text x="${lx + 18}" y="55" font-size="11" fill="${INK2}">${esc(s.name)}</text>`;
    lx += 26 + s.name.length * 11;
  }
  panels.forEach((panel, k) => {
    const ox = k * W; const oy = 64;
    const x = (d) => ox + pad.l + (d / days) * (W - pad.l - pad.r);
    const y = (v) => oy + pad.t + (1 - v / yMax) * (H - pad.t - pad.b);
    svg += `<text x="${ox + pad.l}" y="${oy + 18}" font-size="12" font-weight="600" fill="${INK}">${esc(panel.title)}</text>`;
    for (let v = 0; v <= yMax; v += 30) {
      svg += `<line x1="${x(0)}" x2="${x(days)}" y1="${y(v)}" y2="${y(v)}" stroke="${GRID}" stroke-width="1"/>`;
      svg += `<text x="${x(0) - 6}" y="${y(v) + 4}" font-size="10" fill="${INK2}" text-anchor="end">${v}</text>`;
    }
    for (let d = 0; d <= days; d += Math.max(1, Math.round(days / 7))) svg += `<text x="${x(d)}" y="${y(0) + 16}" font-size="10" fill="${INK2}" text-anchor="middle">${d}</text>`;
    svg += `<text x="${x(days / 2)}" y="${y(0) + 30}" font-size="10" fill="${INK2}" text-anchor="middle">第几天（0 = 练之前）</text>`;
    if (threshold) svg += `<line x1="${x(0)}" x2="${x(days)}" y1="${y(threshold.value)}" y2="${y(threshold.value)}" stroke="${INK2}" stroke-dasharray="3 3"/>`;
    const ends = [];
    for (const s of panel.series) {
      const c = colors[s.id];
      const band = [...s.points.map((q) => `${x(q.day)},${y(q.hi)}`), ...[...s.points].reverse().map((q) => `${x(q.day)},${y(q.lo)}`)].join(' ');
      svg += `<polygon points="${band}" fill="${c}" opacity="0.12"/>`;
      svg += `<polyline points="${s.points.map((q) => `${x(q.day)},${y(q.mean)}`).join(' ')}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>`;
      for (const q of s.points) svg += `<circle cx="${x(q.day)}" cy="${y(q.mean)}" r="3" fill="${c}" stroke="${SURFACE}" stroke-width="1.5"><title>${esc(`${s.name} 第 ${q.day} 天：${q.mean.toFixed(1)}`)}</title></circle>`;
      const last = s.points.at(-1);
      ends.push({ y: y(last.mean), text: `${s.name} ${last.mean.toFixed(0)}` });
    }
    // 末端标签：按高度排开，不重叠
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 12);
    for (const e of ends) svg += `<text x="${x(days) + 5}" y="${e.y + 4}" font-size="10" fill="${INK}">${esc(e.text)}</text>`;
  });
  return `${svg}</svg>\n`;
}

// 敏感性：每行一个参数设置，横轴是第 14 天「完整系统 − 只随机打」的差，三个画像各一个点（形状也不同），虚线是成功标准
export function sensitivitySvg({ title, rows, profiles, colors, threshold }) {
  const rowH = 22; const pad = { l: 190, r: 30, t: 70, b: 40 };
  const width = 720; const height = pad.t + rows.length * rowH + pad.b;
  const all = rows.flatMap((r) => profiles.map((p) => r.diffs[p.id]));
  const lo = Math.min(0, ...all, threshold) - 5; const hi = Math.max(...all, threshold) + 5;
  const x = (v) => pad.l + ((v - lo) / (hi - lo)) * (width - pad.l - pad.r);
  const shapes = ['circle', 'square', 'diamond'];
  const mark = (shape, cx, cy, c) => (shape === 'circle' ? `<circle cx="${cx}" cy="${cy}" r="4.5" fill="${c}" stroke="${SURFACE}" stroke-width="1.5"/>`
    : shape === 'square' ? `<rect x="${cx - 4}" y="${cy - 4}" width="8" height="8" rx="1" fill="${c}" stroke="${SURFACE}" stroke-width="1.5"/>`
      : `<path d="M${cx} ${cy - 5.5}L${cx + 5.5} ${cy}L${cx} ${cy + 5.5}L${cx - 5.5} ${cy}Z" fill="${c}" stroke="${SURFACE}" stroke-width="1.5"/>`);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ${FONT}>`;
  svg += `<rect width="100%" height="100%" fill="${SURFACE}"/><text x="12" y="22" font-size="15" font-weight="600" fill="${INK}">${esc(title)}</text>`;
  let lx = 12;
  profiles.forEach((p, i) => { svg += mark(shapes[i], lx + 5, 44, colors[i]) + `<text x="${lx + 14}" y="48" font-size="11" fill="${INK2}">${esc(p.name)}</text>`; lx += 30 + p.name.length * 12; });
  const step = (hi - lo) > 60 ? 20 : 10;
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
    svg += `<line x1="${x(v)}" x2="${x(v)}" y1="${pad.t - 6}" y2="${height - pad.b}" stroke="${GRID}"/><text x="${x(v)}" y="${height - pad.b + 14}" font-size="10" fill="${INK2}" text-anchor="middle">${v}</text>`;
  }
  svg += `<line x1="${x(threshold)}" x2="${x(threshold)}" y1="${pad.t - 6}" y2="${height - pad.b}" stroke="${INK2}" stroke-dasharray="3 3"/><text x="${x(threshold) + 4}" y="${pad.t - 10}" font-size="10" fill="${INK2}">成功标准 ${threshold}</text>`;
  svg += `<text x="${(pad.l + width - pad.r) / 2}" y="${height - 8}" font-size="10" fill="${INK2}" text-anchor="middle">第 14 天基准手平均分：完整系统 − 只随机打只给分</text>`;
  rows.forEach((r, i) => {
    const cy = pad.t + i * rowH + rowH / 2;
    svg += `<text x="${pad.l - 8}" y="${cy + 4}" font-size="11" fill="${INK}" text-anchor="end">${esc(r.label)}</text>`;
    profiles.forEach((p, k) => { svg += mark(shapes[k], x(r.diffs[p.id]), cy, colors[k]).replace('/>', `><title>${esc(`${r.label} ${p.name}：${r.diffs[p.id].toFixed(1)}`)}</title></${shapes[k] === 'circle' ? 'circle' : shapes[k] === 'square' ? 'rect' : 'path'}>`); });
  });
  return `${svg}</svg>\n`;
}
