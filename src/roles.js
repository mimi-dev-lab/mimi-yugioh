// 卡的作用标签：检查卡组数据里的 roleTags（术语、每张卡的默认作用、路线每一步的覆盖），并算路线每一步中场每张卡此刻的作用。
// 数据写法和规矩见 src/decks/branded-roles.js 文件头。纯函数。

// 返回问题列表（空 = 没问题）。deck.roleTags = { terms, defaults, routes }
export function checkRoleTags(deck) {
  const { terms, defaults, routes } = deck.roleTags;
  const problems = [];
  const names = new Set();
  for (const term of terms) {
    if (names.has(term.name)) problems.push(`术语 ${term.name} 重复`);
    names.add(term.name);
    if (!term.note?.trim()) problems.push(`术语 ${term.name} 缺解释`);
    if (!/^#[0-9a-f]{6}$/i.test(term.color ?? '')) problems.push(`术语 ${term.name} 的颜色 ${term.color} 不是 #rrggbb`);
  }
  const entry = (where, e) => {
    if (!Array.isArray(e.tags) || e.tags.length < 1 || e.tags.length > 2) problems.push(`${where} 要 1 到 2 个作用`);
    for (const tag of e.tags ?? []) if (!names.has(tag)) problems.push(`${where} 的作用 ${tag} 不在术语表里`);
    if (typeof e.why !== 'string' || e.why.trim().length < 10) problems.push(`${where} 缺原因（至少 10 个字）`);
  };
  const whys = new Set(); // 默认作用之间不许一字不差；路线里的覆盖在同一条路线内查（不同路线走同一步棋，原因可以一样）
  for (const code of Object.keys(deck.cards)) {
    if (!defaults[code]) { problems.push(`${deck.cards[code].jp}（${code}）缺默认作用`); continue; }
    entry(`${deck.cards[code].jp}（${code}）的默认作用`, defaults[code]);
    if (whys.has(defaults[code].why)) problems.push(`${deck.cards[code].jp}（${code}）的默认原因和别处一字不差，要写它自己的`);
    whys.add(defaults[code].why);
  }
  for (const code of Object.keys(defaults)) if (!deck.cards[code]) problems.push(`默认作用里的 ${code} 不在卡表里`);
  for (const [id, steps] of Object.entries(routes)) {
    const route = deck.routes.find((r) => r.id === id);
    if (!route) { problems.push(`作用数据里的路线 ${id} 不存在`); continue; }
    const routeWhys = new Set(whys);
    for (const [n, cards] of Object.entries(steps)) {
      if (!(Number.isInteger(Number(n)) && n >= 1 && n <= route.steps.length)) problems.push(`${id} 没有第 ${n} 步`);
      for (const [code, e] of Object.entries(cards)) {
        if (!deck.cards[code]) { problems.push(`${id} 第 ${n} 步的 ${code} 不在卡表里`); continue; }
        entry(`${id} 第 ${n} 步 ${deck.cards[code].jp}`, e);
        if (routeWhys.has(e.why)) problems.push(`${id} 第 ${n} 步 ${deck.cards[code].jp} 的原因和默认作用或这条路线别的步一字不差，要写这一步自己的`);
        routeWhys.add(e.why);
      }
    }
  }
  return problems;
}

// 一张卡的默认作用：{ tags, why }
export const defaultRoleOf = (deck, code) => deck.roleTags.defaults[code];

// 路线每一步中场每张卡此刻的作用。midfields[i] = 第 i+1 步走完后中场（怪兽区和魔陷区）的密码列表。
// 返回同样长的数组，每步是 [{ code, tags, why, from, since? }]：from 是 step（这一步写了）、carried（页面标「自第 since 步起」：沿用之前写的，since 是写在第几步）、default（默认）。
// 沿用的规矩：往前找这张卡连续在场的最近一次写的；中途离过场就不沿用
export function resolveRoles(deck, routeId, midfields) {
  const overrides = deck.roleTags.routes[routeId] ?? {};
  return midfields.map((codes, i) => [...new Set(codes)].map((code) => {
    for (let j = i; j >= 0 && midfields[j].includes(code); j--) {
      const e = overrides[j + 1]?.[code];
      if (e) return { code, tags: e.tags, why: e.why, from: j === i ? 'step' : 'carried', since: j + 1 };
    }
    const d = defaultRoleOf(deck, code);
    return { code, tags: d.tags, why: d.why, from: 'default' };
  }));
}

// 手牌里此刻有作用的卡（作用数据只写中场，手牌不另写数据）：对手回合从手牌用的卡才标，别的手牌不标。
// - 终场时算进打断数的手牌（breakerCodes，铁兽鸟 墨丘利耶这类能从手牌发动的打断）：默认作用里有「打断」就用默认作用，没有就标「打断」+ 怎么打断；
// - 默认作用里有「手坑」的卡：用默认作用。
// 返回 [{ code, tags, why, from: 'default' | 'breaker' }]，每个密码一条
export function handRoles(deck, codes, breakerCodes = []) {
  return [...new Set(codes)].flatMap((code) => {
    const d = defaultRoleOf(deck, code);
    if (breakerCodes.includes(code)) {
      return [d.tags.includes('打断') ? { code, tags: d.tags, why: d.why, from: 'default' } : { code, tags: ['打断'], why: `终场时在手牌里也算一个打断：${deck.cards[code].interruptHow}`, from: 'breaker' }];
    }
    return d.tags.includes('手坑') ? [{ code, tags: d.tags, why: d.why, from: 'default' }] : [];
  });
}
