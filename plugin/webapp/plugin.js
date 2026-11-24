/* 游戏王 in the web workspace (the browser version of Hermes Desktop): sidebar item 游戏王, route /yugioh.
   A Branded (烙印) tutorial wiki, drawn as a shell over the yugioh service (src/), reached through this plugin's backend
   (../dashboard/plugin_api.py) and ctx.rest, which adds /api/plugins/yugioh and the web workspace's own login and path prefix:
   GET /deck (every card: Master Duel and Japanese names, role, count, the three things, how it interrupts on the opponent's turn),
   GET /routes (the 展开路线 list, plus `lookup`, the 起手速查 data: key card -> routes, and which route to take without a card) and
   GET /route?id= (one route's steps: the engine's board after each step, what changed, the end summary),
   GET /card-image?code= (JSON with base64; drawn as a data: address).
   Tabs: 卡组一览 (the deck grouped by role; click a card for its effect), 展开路线 (the route list, then a player: previous / next / jump / arrow keys,
   a step bar starting with 起手 (the opening hand, step 0, no diff), the last step is the end summary), 起手速查 (per key card: the route(s) to take with its end interrupts, and "缺 X → route" lines; a click jumps to that route's player, step 0).
   Nothing to play and no scores: the page only reads.
   A disk plugin: plain ESM, no build step, importing only @hermes/plugin-sdk, react and react/jsx-runtime. No outside
   fonts, images or requests.
   The look is its own (design-r3): a true-black ground, #c8ff3d as the accent, grey text no darker than #bdbdbd,
   independent of the workspace's light / dark theme; usable at phone width. */
import { ROUTES_AREA, SIDEBAR_NAV_AREA } from "@hermes/plugin-sdk";
import { createElement as h, useState, useEffect } from "react";

const TABS = ["卡组一览", "展开路线", "起手速查"];
const ZONE_NAME = { main: "主卡组", extra: "额外卡组" };

const message = (e) => String(e?.message ?? e).replace(/^\d+:\s*/, "");

// card pictures: one request per card per page load, kept as data: addresses (ctx.rest only reads JSON)
const imageCache = new Map();
function loadImage(rest, code) {
  if (!imageCache.has(code)) {
    imageCache.set(code, rest(`/card-image?code=${code}`).then((r) => `data:${r.type};base64,${r.base64}`).catch(() => null));
  }
  return imageCache.get(code);
}
function CardArt({ rest, code, md, className = "" }) {
  const [src, setSrc] = useState(undefined);
  useEffect(() => {
    let live = true;
    loadImage(rest, code).then((s) => { if (live) setSrc(s); });
    return () => { live = false; };
  }, [rest, code]);
  if (src) return h("img", { className: `yg-art ${className}`, src, alt: md, draggable: false });
  return h("div", { className: `yg-art yg-noart ${className}`, "aria-label": md }, src === undefined ? "" : md);
}

// ---- one card in the deck list: art, ×count, interrupt chip, Master Duel name, Japanese name ----
function Tile({ rest, card, selected, onClick }) {
  return h("button", { className: `yg-tile${selected ? " sel" : ""}`, onClick, "aria-label": card.md, "aria-pressed": selected },
    h("span", { className: "yg-tile-art" },
      h(CardArt, { rest, code: card.code, md: card.md }),
      card.count > 1 ? h("span", { className: "yg-count" }, `×${card.count}`) : null,
      card.zone === "extra" ? h("span", { className: "yg-tag" }, "额外") : null),
    h("span", { className: "yg-name" }, card.md),
    h("span", { className: "yg-jp" }, card.jp),
    card.interrupts > 0 ? h("span", { className: "yg-chip on" }, `打断 ${card.interrupts}`) : null);
}

// ---- the card clicked: big art, both names, role, count, the three things, the opponent's turn ----
function Detail({ rest, card, onClose }) {
  if (!card) return h("aside", { className: "yg-detail empty", "aria-label": "卡的说明" }, h("p", { className: "yg-lab" }, "点一张卡看效果说明"));
  const fact = (label, text) => h("div", { className: "yg-fact" }, h("span", { className: "yg-lab" }, label), h("span", null, text));
  return h("aside", { className: "yg-detail", "aria-label": "卡的说明" },
    h("div", { className: "yg-detail-head" },
      h(CardArt, { rest, code: card.code, md: card.md, className: "yg-big" }),
      h("div", { className: "yg-col" },
        h("div", { className: "yg-title" }, card.md),
        h("div", { className: "yg-lab" }, card.jp),
        h("div", { className: "yg-row wrap" },
          h("span", { className: "yg-chip on" }, card.role),
          h("span", { className: "yg-chip" }, `${ZONE_NAME[card.zone]} ×${card.count}`)),
        h("button", { className: "yg-btn small yg-close", onClick: onClose, "aria-label": "关上" }, "× 关上"))),
    h("div", { className: "yg-facts" },
      fact("干什么", card.does),
      fact("条件代价", card.cost),
      fact("限制", card.limit),
      fact("对手回合", card.interrupts > 0 ? `终场时能打断 ${card.interrupts} 次：${card.interruptHow}`
        : card.role === "手坑" ? "从手牌发动，不算终场的打断" : "终场时不提供打断")));
}

// ---- 卡组一览: the deck grouped by role, the clicked card's effect beside (below on a phone) ----
function DeckView({ rest, deck }) {
  const [code, setCode] = useState(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setCode(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const total = (zone) => deck.cards.filter((c) => c.zone === zone).reduce((n, c) => n + c.count, 0);
  const card = deck.cards.find((c) => c.code === code) ?? null;
  return h("div", { className: `yg-deck${card ? " open" : ""}` },
    h("div", { className: "yg-groups" },
      h("p", { className: "yg-lab yg-sum" }, `${deck.name} · 主卡组 ${total("main")} 张 · 额外卡组 ${total("extra")} 张 · 卡表来自 `,
        h("a", { href: deck.source.url, target: "_blank", rel: "noopener noreferrer" }, `${deck.source.name}（${deck.source.date} 版）`)),
      deck.roles.map((role) => {
        const cards = deck.cards.filter((c) => c.role === role.name);
        return h("section", { key: role.name, className: "yg-group", "aria-label": role.name },
          h("div", { className: "yg-line" }, h("h2", null, role.name), h("span", { className: "yg-lab" }, `${cards.reduce((n, c) => n + c.count, 0)} 张 · ${role.note}`)),
          h("div", { className: "yg-tiles" }, cards.map((c) => h(Tile, { key: c.code, rest, card: c, selected: c.code === code, onClick: () => setCode(c.code === code ? null : c.code) }))));
      })),
    h(Detail, { rest, card, onClose: () => setCode(null) }));
}

// ---- 展开路线: the list, then the player ----
const ZONE_LABEL = { hand: "手牌", monsters: "怪兽区", spellTraps: "魔陷区", grave: "墓地", banished: "除外" };
const BOARD_ZONES = ["monsters", "spellTraps", "hand", "grave", "banished"];

function MiniCard({ rest, card, fresh, zone }) {
  return h("div", { className: `yg-mini${fresh ? " fresh" : ""}`, title: card.jp, "data-fresh": fresh ? "true" : "false" },
    h("span", { className: "yg-mini-art" },
      h(CardArt, { rest, code: card.code, md: card.md }),
      fresh ? h("span", { className: "yg-new" }, "新") : null,
      zone === "monsters" && card.sequence >= 5 && card.sequence <= 6 ? h("span", { className: "yg-tag" }, "额外怪兽区") : null),
    h("span", { className: "yg-name" }, card.md));
}

function ZoneRow({ rest, label, cards, zone, empty = "空" }) {
  return h("section", { className: "yg-zone", "aria-label": label },
    h("div", { className: "yg-zone-lab" }, h("span", null, label), h("span", { className: "yg-lab" }, `${cards.length} 张`)),
    cards.length ? h("div", { className: "yg-minis" }, cards.map((c, i) => h(MiniCard, { key: `${c.code}-${i}`, rest, card: c, fresh: c.fresh, zone }))) : h("span", { className: "yg-lab" }, empty));
}

// 花了什么 → 换来什么: what left each zone, what came into it
function Trade({ diff }) {
  const side = (key, title) => {
    const rows = BOARD_ZONES.map((zone) => [zone, diff[zone][key]]).filter(([, cards]) => cards.length);
    return h("div", { className: "yg-side" }, h("span", { className: "yg-lab" }, title),
      rows.length ? rows.map(([zone, cards]) => h("div", { key: zone, className: "yg-trade-row" }, h("span", { className: "yg-chip" }, ZONE_LABEL[zone]), h("span", null, cards.map((c) => c.md).join("、")))) : h("span", { className: "yg-lab" }, "没有"));
  };
  return h("div", { className: "yg-trade", "aria-label": "花了什么 → 换来什么" }, side("out", "花了什么（离开）"), h("span", { className: "yg-arrow", "aria-hidden": "true" }, "→"), side("in", "换来什么（进来）"));
}

function EndSummary({ rest, end }) {
  return h("section", { className: "yg-end", "aria-label": "终场汇总" },
    h("h2", null, "终场汇总"),
    h("p", { className: "yg-end-num" }, "对手回合能打断 ", h("span", { className: "yg-bignum" }, end.interrupts), " 次"),
    end.breakers.length ? h("ul", { className: "yg-breakers" }, end.breakers.map((b) => h("li", { key: b.code },
      h("strong", null, `${b.md}${b.copies > 1 ? ` ×${b.copies}` : ""}`), h("span", { className: "yg-chip on" }, `打断 ${b.interrupts}`), h("span", { className: "yg-lab" }, b.interruptHow)))) : h("p", { className: "yg-lab" }, "终场没有打断"),
    h(ZoneRow, { rest, label: "场上的怪兽", cards: end.monsters, zone: "monsters" }),
    h(ZoneRow, { rest, label: "场上的魔陷", cards: end.spellTraps, zone: "spellTraps" }),
    h(ZoneRow, { rest, label: "剩余手牌", cards: end.hand, zone: "hand" }));
}

// position 0 is 起手 (the opening hand, nothing spent yet); positions 1..total are the route's steps
function Player({ rest, id, onBack }) {
  const [route, setRoute] = useState(null);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  useEffect(() => {
    let live = true;
    setRoute(null); setIndex(0); setError("");
    rest(`/route?id=${id}`).then((r) => { if (live) setRoute(r); }).catch((e) => { if (live) setError(message(e)); });
    return () => { live = false; };
  }, [rest, id]);
  const total = route?.steps.length ?? 0;
  useEffect(() => {
    const onKey = (e) => {
      if (total === 0 || e.target?.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName ?? "")) return;
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIndex((i) => Math.min(total, i + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total]);
  if (error) return h("div", { className: "yg-error", role: "alert" }, error);
  if (!route) return h("p", { className: "yg-lab" }, "读取路线…");
  const opening = index === 0;
  const step = opening ? null : route.steps[index - 1];
  const board = opening ? route.start : step.board;
  const last = index === total;
  const mismatch = [route.mismatch, ...route.engineDiff.map((d) => `引擎重放和教程写的终场不一致：${d}`)].filter(Boolean);
  return h("div", { className: "yg-player", "data-step": String(index), "data-total": String(total) },
    h("div", { className: "yg-row wrap" },
      h("button", { className: "yg-btn small", onClick: onBack }, "← 路线列表"),
      h("h2", { className: "yg-route-title" }, route.name)),
    h("p", { className: "yg-lab yg-sum" }, "来源 ",
      h("a", { href: route.source.url, target: "_blank", rel: "noopener noreferrer" }, route.source.name),
      ` · 页面版本 ${route.source.date} · 引擎验证于 ${route.verified}`),
    mismatch.length ? h("div", { className: "yg-mismatch", role: "alert" }, h("strong", null, "教程和引擎不一致"), mismatch.map((m, i) => h("p", { key: i }, m))) : null,
    h("div", { className: "yg-stepbar", role: "group", "aria-label": "跳到某一步" },
      h("button", { className: `yg-stepno${opening ? " on" : ""}`, onClick: () => setIndex(0), "aria-label": "起手", "aria-current": opening ? "step" : undefined }, "起手"),
      route.steps.map((s, i) => h("button", { key: s.n, className: `yg-stepno${i + 1 === index ? " on" : ""}`, onClick: () => setIndex(i + 1), "aria-label": `第 ${s.n} 步`, "aria-current": i + 1 === index ? "step" : undefined }, String(s.n)))),
    h("div", { className: "yg-nav" },
      h("button", { className: "yg-btn", disabled: opening, onClick: () => setIndex(index - 1) }, "上一步"),
      h("span", { className: "yg-lab yg-pos" }, opening ? `起手 · 共 ${total} 步` : `第 ${index} / ${total} 步${last ? " · 终场" : ""}`),
      h("button", { className: "yg-btn", disabled: last, onClick: () => setIndex(index + 1) }, "下一步")),
    h("section", { className: "yg-step", "aria-label": opening ? "起手" : "这一步" },
      opening ? h("p", { className: "yg-step-text" }, "起手：先看这副手牌，往后每一步都和上一步比")
        : [
          h("p", { key: "text", className: "yg-step-text" }, step.text),
          step.activated.length ? h("p", { key: "act" }, h("span", { className: "yg-lab" }, "发动了 "), step.activated.map((c) => c.md).join("、")) : null,
          step.actions.length ? h("p", { key: "acts", className: "yg-lab" }, `引擎里的操作：${step.actions.join(" · ")}`) : null,
          h(Trade, { key: "trade", diff: step.diff }),
        ]),
    h("div", { className: "yg-board", "aria-label": "完整场面" },
      BOARD_ZONES.map((zone) => h(ZoneRow, { key: zone, rest, label: ZONE_LABEL[zone], cards: board[zone], zone }))),
    last ? h(EndSummary, { rest, end: route.end }) : null);
}

// `loaded` is the shared GET /routes result: { data, error } (data null until it arrives)
function RoutesView({ rest, loaded, id, setId }) {
  if (id) return h(Player, { rest, id, onBack: () => setId(null) });
  if (loaded.error) return h("div", { className: "yg-error", role: "alert" }, loaded.error);
  const routes = loaded.data?.routes;
  if (!routes) return h("p", { className: "yg-lab" }, "读取路线…");
  return h("div", { className: "yg-routes" },
    h("p", { className: "yg-lab yg-sum" }, "每条路线的每一步都在规则引擎里重放过，场面是引擎的结果。点一条逐步看。"),
    routes.map((r) => h("button", { key: r.id, className: "yg-route", "data-route-id": r.id, onClick: () => setId(r.id), "aria-label": r.name },
      h("span", { className: "yg-route-art" }, h(CardArt, { rest, code: r.needs.code, md: r.needs.md })),
      h("span", { className: "yg-col" },
        h("span", { className: "yg-title" }, r.name),
        h("span", null, h("span", { className: "yg-lab" }, "需要的起手卡 "), r.needs.md),
        h("span", { className: "yg-row wrap" },
          h("span", { className: "yg-chip on" }, `终场打断 ${r.interrupts}`),
          h("span", { className: "yg-chip" }, `${r.steps} 步`),
          r.mismatch || r.engineDiff.length ? h("span", { className: "yg-chip warn" }, "和教程不一致") : null),
        h("span", { className: "yg-lab" }, `来源 ${r.source.name}（${r.source.date} 版）· 引擎验证于 ${r.verified}`)))));
}

// ---- 起手速查: per key card, the route(s) to take and what to do without a card; every route is a button that opens its player ----
function JumpButton({ route, onOpen, extra }) {
  return h("button", { className: "yg-jump", "data-route-id": route.id, onClick: () => onOpen(route.id), "aria-label": `打开路线：${route.name}` },
    h("span", { className: "yg-title" }, route.name),
    h("span", { className: "yg-row wrap" },
      h("span", { className: "yg-chip on" }, `终场打断 ${route.interrupts}`),
      h("span", { className: "yg-chip" }, `${route.steps} 步`),
      extra ?? null));
}

function LookupView({ rest, loaded, onOpen }) {
  if (loaded.error) return h("div", { className: "yg-error", role: "alert" }, loaded.error);
  const lookup = loaded.data?.lookup;
  if (!lookup) return h("p", { className: "yg-lab" }, "读取速查…");
  return h("div", { className: "yg-lookup" },
    h("p", { className: "yg-lab yg-sum" }, "手里有哪张关键卡，就走哪条路线；缺某张卡时看「缺」那几行。点路线名，打开那条路线的逐步播放。每条路线都在规则引擎里重放过。"),
    lookup.map((e) => h("section", { key: e.card.code, className: "yg-key", "aria-label": e.card.md, "data-card-code": String(e.card.code) },
      h("div", { className: "yg-key-head" },
        h("span", { className: "yg-route-art" }, h(CardArt, { rest, code: e.card.code, md: e.card.md })),
        h("span", { className: "yg-col" },
          h("span", { className: "yg-title" }, e.card.md),
          h("span", { className: "yg-lab" }, e.card.jp),
          h("span", { className: "yg-lab" }, "手里有它：走"))),
      h("div", { className: "yg-jumps" }, e.routes.map((r) => h(JumpButton, { key: r.id, route: r, onOpen,
        extra: r.with ? h("span", { className: "yg-chip" }, `搭 ${r.with.md}`) : null }))),
      e.fallbacks.length ? h("div", { className: "yg-fallbacks" },
        e.fallbacks.map((f, i) => h("div", { key: i, className: "yg-fallback", "data-route-id": f.route.id },
          h("p", { className: "yg-fb-line" }, h("strong", null, `缺 ${f.lack.md}`), h("span", { className: "yg-lab" }, ` 手里有 ${f.have.map((c) => c.md).join("、")} → `)),
          h(JumpButton, { route: f.route, onOpen }),
          h("p", { className: "yg-lab" }, f.how)))) : null)));
}

function YugiohApp({ rest }) {
  const [tab, setTab] = useState(TABS[0]);
  const [deck, setDeck] = useState(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [routeId, setRouteId] = useState(null); // the route open in 展开路线 (null = the list); 起手速查 sets it to jump there
  const [routes, setRoutes] = useState({ data: null, error: "" }); // one GET /routes shared by 展开路线 and 起手速查 (a 503 shows only in those two tabs)
  useEffect(() => {
    rest("/routes").then((data) => setRoutes({ data, error: "" })).catch((e) => setRoutes({ data: null, error: message(e) }));
  }, [rest]);
  useEffect(() => {
    (async () => {
      try { setDeck(await rest("/deck")); } catch (e) { setError(message(e)); }
      setReady(true);
    })();
  }, [rest]);

  let main = null;
  if (tab === "展开路线") main = h(RoutesView, { rest, loaded: routes, id: routeId, setId: setRouteId });
  else if (tab === "起手速查") main = h(LookupView, { rest, loaded: routes, onOpen: (id) => { setRouteId(id); setTab("展开路线"); } });
  else if (deck) main = h(DeckView, { rest, deck });
  return h("div", { className: "yg", "data-ready": ready ? "true" : "false" },
    h("header", { className: "yg-head" }, h("h1", null, "游戏王 · 烙印教程"),
      h("nav", { className: "yg-tabs" }, TABS.map((t) => h("button", { key: t, className: `yg-tab${tab === t ? " on" : ""}`, onClick: () => setTab(t) }, t)))),
    error ? h("div", { className: "yg-error", role: "alert" }, error) : null,
    main);
}

const CSS = `
.yg { position: relative; min-height: 100%; box-sizing: border-box; background: #000; color: #ececec; padding: 16px 20px;
  font-family: "PingFang SC", "Noto Sans SC", system-ui, sans-serif; font-size: 13px; }
.yg *, .yg *::before, .yg *::after { box-sizing: border-box; }
.yg button { font: inherit; color: inherit; cursor: pointer; }
.yg h1, .yg h2, .yg p { margin: 0; }
.yg a { color: #c8ff3d; }
.yg-lab { font-size: 12px; color: #bdbdbd; letter-spacing: .04em; }
.yg-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 24px; margin-bottom: 18px; }
.yg-head h1 { font-size: 18px; }
.yg-tabs { display: flex; gap: 6px; margin-left: auto; }
.yg-tab { background: none; border: 0; border-bottom: 2px solid transparent; padding: 6px 12px; color: #bdbdbd; }
.yg-tab.on { color: #c8ff3d; border-color: #c8ff3d; }
.yg-error { border: 1px solid #ff9a6b; color: #ff9a6b; border-radius: 6px; padding: 8px 12px; margin-bottom: 10px; }
.yg-row { display: flex; gap: 8px; align-items: center; } .yg-row.wrap { flex-wrap: wrap; }
.yg-col { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.yg-line { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 14px; }
.yg-btn { min-height: 34px; padding: 0 14px; border-radius: 5px; border: 1px solid #3a3a3a; background: none; display: inline-flex; align-items: center; justify-content: center; }
.yg-btn.small { min-height: 28px; padding: 0 10px; font-size: 12px; align-self: flex-start; }
.yg-chip { font-size: 11px; padding: 2px 8px; border-radius: 9px; border: 1px solid #444; color: #bdbdbd; white-space: nowrap; }
.yg-chip.on { background: #c8ff3d; border-color: #c8ff3d; color: #000; font-weight: 600; }
.yg-art { width: 100%; height: 100%; object-fit: cover; border-radius: 3px; display: block; }
.yg-noart { background: #141414; border: 1px solid #262626; color: #d6d6d6; font-size: 10px; display: flex; align-items: center; justify-content: center; padding: 4px; text-align: center; overflow: hidden; }
.yg-deck { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 22px; align-items: start; }
.yg-groups { display: flex; flex-direction: column; gap: 22px; min-width: 0; }
.yg-sum { line-height: 1.6; }
.yg-group { display: flex; flex-direction: column; gap: 12px; }
.yg-group h2 { font-size: 16px; color: #c8ff3d; }
.yg-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 16px 12px; }
.yg-tile { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px 4px; background: none; border: 1px solid transparent; border-radius: 6px; text-align: center; }
.yg-tile:hover { border-color: #2a2a2a; }
.yg-tile.sel { border-color: #c8ff3d; }
.yg-tile-art { position: relative; width: 100%; max-width: 86px; aspect-ratio: 59 / 86; }
.yg-tile .yg-name { font-size: 12px; line-height: 1.35; color: #ececec; }
.yg-tile.sel .yg-name { color: #c8ff3d; }
.yg-jp { font-size: 10px; line-height: 1.3; color: #bdbdbd; }
.yg-count { position: absolute; right: -4px; top: -4px; min-width: 22px; padding: 1px 5px; border-radius: 9px; background: #c8ff3d; color: #000; font-size: 11px; font-weight: 600; }
.yg-tag { position: absolute; left: 2px; bottom: 2px; padding: 0 4px; border-radius: 3px; background: rgba(0, 0, 0, .8); color: #ececec; font-size: 10px; }
.yg-detail { position: sticky; top: 12px; border: 1px solid #1f1f1f; border-radius: 8px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; background: #000; }
.yg-detail.empty { min-height: 160px; align-items: center; justify-content: center; }
.yg-detail-head { display: flex; gap: 14px; align-items: flex-start; }
.yg-big { width: 120px; height: 175px; flex: none; }
.yg-title { font-size: 16px; font-weight: 600; line-height: 1.4; }
.yg-facts { display: flex; flex-direction: column; font-size: 12px; line-height: 1.6; }
.yg-fact { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 8px; padding: 8px 0; border-top: 1px solid #1c1c1c; }
.yg-routes { display: flex; flex-direction: column; gap: 14px; max-width: 760px; }
.yg-route { display: flex; gap: 14px; align-items: flex-start; text-align: left; padding: 12px; border: 1px solid #2a2a2a; border-radius: 8px; background: #000; }
.yg-route:hover { border-color: #c8ff3d; }
.yg-route-art { width: 64px; flex: none; aspect-ratio: 59 / 86; }
.yg-chip.warn { border-color: #ff9a6b; color: #ff9a6b; }
.yg-lookup { display: flex; flex-direction: column; gap: 14px; max-width: 760px; }
.yg-key { display: flex; flex-direction: column; gap: 12px; padding: 12px; border: 1px solid #2a2a2a; border-radius: 8px; min-width: 0; }
.yg-key-head { display: flex; gap: 14px; align-items: flex-start; }
.yg-jumps, .yg-fallbacks { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.yg-jump { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; text-align: left; padding: 10px 12px; border: 1px solid #3a3a3a; border-radius: 6px; background: #000; min-width: 0; max-width: 100%; }
.yg-jump:hover { border-color: #c8ff3d; }
.yg-fallbacks { border-top: 1px solid #1c1c1c; padding-top: 10px; }
.yg-fallback { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; line-height: 1.6; min-width: 0; }
.yg-fb-line strong { color: #ececec; }
.yg-player { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.yg-route-title { font-size: 18px; }
.yg-mismatch { border: 2px solid #ff9a6b; border-radius: 8px; padding: 10px 14px; color: #ffb48f; background: #1c0f08; display: flex; flex-direction: column; gap: 4px; line-height: 1.6; }
.yg-stepbar { display: flex; flex-wrap: wrap; gap: 6px; }
.yg-stepno { min-width: 34px; height: 34px; border-radius: 5px; border: 1px solid #3a3a3a; background: none; padding: 0 6px; }
.yg-stepno.on { background: #c8ff3d; border-color: #c8ff3d; color: #000; font-weight: 600; }
.yg-nav { display: flex; align-items: center; gap: 12px; }
.yg-btn:disabled { opacity: .35; cursor: default; }
.yg-step { border: 1px solid #1f1f1f; border-radius: 8px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; line-height: 1.6; }
.yg-step-text { font-size: 15px; font-weight: 600; }
.yg-trade { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 12px; align-items: start; }
.yg-side { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.yg-trade-row { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.yg-arrow { color: #c8ff3d; font-size: 20px; padding-top: 18px; }
.yg-board, .yg-end { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.yg-zone { display: flex; flex-direction: column; gap: 6px; padding: 8px 0; border-top: 1px solid #1c1c1c; min-width: 0; }
.yg-zone-lab { display: flex; gap: 10px; align-items: baseline; }
.yg-minis { display: flex; flex-wrap: wrap; gap: 10px; }
.yg-mini { width: 76px; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 4px; border: 2px solid transparent; border-radius: 6px; text-align: center; }
.yg-mini.fresh { border-color: #c8ff3d; background: rgba(200, 255, 61, .12); }
.yg-mini-art { position: relative; width: 100%; aspect-ratio: 59 / 86; }
.yg-mini .yg-name { font-size: 11px; line-height: 1.3; }
.yg-new { position: absolute; right: -4px; top: -4px; padding: 0 5px; border-radius: 9px; background: #c8ff3d; color: #000; font-size: 11px; font-weight: 600; }
.yg-end { border: 1px solid #c8ff3d; border-radius: 8px; padding: 14px 16px; }
.yg-end h2 { font-size: 16px; color: #c8ff3d; }
.yg-end-num { font-size: 15px; }
.yg-bignum { font-size: 30px; vertical-align: -3px; padding: 0 2px; font-weight: 700; color: #c8ff3d; }
.yg-breakers { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.yg-breakers li { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; line-height: 1.6; }
@media (max-width: 760px) {
  .yg { padding: 12px; }
  .yg-head h1 { font-size: 16px; }
  .yg-tabs { margin-left: 0; width: 100%; } .yg-tab { flex: 1; padding: 6px 4px; }
  .yg-deck { grid-template-columns: minmax(0, 1fr); }
  .yg-tiles { grid-template-columns: repeat(auto-fill, minmax(78px, 1fr)); gap: 12px 8px; }
  .yg-detail.empty { display: none; }
  .yg-deck.open { padding-bottom: 58vh; }
  .yg-detail { position: fixed; left: 0; right: 0; bottom: 0; top: auto; max-height: 56vh; overflow-y: auto; border-radius: 12px 12px 0 0; border-color: #3a3a3a; z-index: 5; }
  .yg-big { width: 96px; height: 140px; }
  .yg-trade { grid-template-columns: minmax(0, 1fr); } .yg-arrow { padding-top: 0; transform: rotate(90deg); justify-self: start; }
  .yg-mini { width: 62px; padding: 3px; } .yg-mini .yg-name { font-size: 10px; }
  .yg-route-art { width: 52px; }
  .yg-end, .yg-step { padding: 12px; }
}
`;

export default {
  id: "yugioh",
  name: "游戏王",
  description: "游戏王 (a Branded tutorial over the yugioh service)",
  register(ctx) {
    const style = document.createElement("style");
    style.dataset.plugin = "yugioh";
    style.textContent = CSS;
    document.head.appendChild(style);
    ctx.onDispose(() => style.remove());
    const rest = (path, opts) => ctx.rest(path, opts);
    ctx.registerMany([
      { id: "page", area: ROUTES_AREA, data: { path: "/yugioh" }, render: () => h(YugiohApp, { rest }) },
      { id: "nav", area: SIDEBAR_NAV_AREA, data: { path: "/yugioh", label: "游戏王", codicon: "game" } },
    ]);
  },
};
