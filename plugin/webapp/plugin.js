/* 游戏王 in the web workspace (the browser version of Hermes Desktop): sidebar item 游戏王, route /yugioh.
   A Branded (烙印) tutorial wiki, drawn as a shell over the yugioh service (src/), reached through this plugin's backend
   (../dashboard/plugin_api.py) and ctx.rest, which adds /api/plugins/yugioh and the web workspace's own login and path prefix:
   GET /deck (every card: Master Duel and Japanese names, role, count, the three things, how it interrupts on the opponent's turn),
   GET /card-image?code= (JSON with base64; drawn as a data: address).
   Tabs: 卡组一览 (the deck grouped by role; click a card for its effect), 展开路线 and 起手速查 (placeholders until their tickets).
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

function YugiohApp({ rest }) {
  const [tab, setTab] = useState(TABS[0]);
  const [deck, setDeck] = useState(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    (async () => {
      try { setDeck(await rest("/deck")); } catch (e) { setError(message(e)); }
      setReady(true);
    })();
  }, [rest]);

  let main = null;
  if (tab !== "卡组一览") main = h("div", { className: "yg-soon" }, h("h2", null, tab), h("p", { className: "yg-lab" }, `「${tab}」还没做，下一步加上。`));
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
.yg-soon { display: flex; flex-direction: column; gap: 12px; padding: 24px 4px; }
.yg-soon h2 { font-size: 20px; }
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
