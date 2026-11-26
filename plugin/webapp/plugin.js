/* 游戏王 in the web workspace (the browser version of Hermes Desktop): sidebar item 游戏王, route /yugioh.
   A Branded (烙印) tutorial wiki, drawn as a shell over the yugioh service (src/), reached through this plugin's backend
   (../dashboard/plugin_api.py) and ctx.rest, which adds /api/plugins/yugioh and the web workspace's own login and path prefix:
   GET /deck (every card: Master Duel and Japanese names, role, count, the three things, how it interrupts on the opponent's turn),
   GET /routes (the 展开路线 list, plus `lookup`, the 起手速查 data: key card -> routes, and which route to take without a card) and
   GET /route?id= (one route's steps: the engine's board after each step, what changed, the end summary),
   GET /card-image?code= (JSON with base64; drawn as a data: address).
   Tabs: 卡组一览 (the deck grouped by the first role tag; click a card for its effect), 展开路线 (the route list, then a player: previous / next / jump / arrow keys,
   a step bar starting with 起手 (the opening hand, step 0, no diff), the last step is the end summary), 起手速查 (per key card: the route(s) to take with its end interrupts, and "缺 X → route" lines; a click jumps to that route's player, step 0).
   Card popup: any card (卡组一览, route boards, 起手速查) pops up its big art, both names, role and the three things when hovered (desktop) or tapped
   (phone: a bottom sheet with 关上; Esc closes). One entry point: useCardPopup() gives { show(code, rect), hide, bind(code) }; show() takes a card code and a
   DOMRect (or {left, top, right, bottom}) in the page's viewport coordinates and flips / clamps the popup inside the window, so another source (a frame) can use it too.
   作用标签 (role tags, from the service: GET /deck's roleTerms and each card's roleTags / roleWhy, GET /route's steps[].roles): a coloured chip per tag; hovering a chip shows
   why, the card popup shows the card's default role and, inside a route, the role at the step on screen; the step panel and the end summary list every midfield card with its chips and
   the reason line (visible on a phone too). On the route animation every card on the field (and a hand card with a job this step: a hand trap, an interrupt kept in the hand)
   carries its chips; hovering (phone: tapping) a chip there shows the reason in a small tip (the frame sends yg-role-hover / yg-role-tap / yg-role-leave). 卡组一览 groups by each card's first default tag; the 术语表 tab explains every word.
   先猜再看 (a switch next to 连播, kept in localStorage, off by default): on, a step does not play until it is revealed: the panel shows only 「第 n 步：想想下一步做什么？」, a click on it, the space bar
   or 下一步 plays that step; 连播 stops at every step the same way. Off, the player is as before.
   积木 (blocks, from GET /route's blocks and steps[].block): the route is a few named, reusable pieces; the step bar is split into one coloured segment per block with its name
   above the step numbers, and the step panel (and the end panel) shows the current block: its name, which steps it spans and 要什么 → 给什么; the 起手 panel lists the route's blocks.
   With 先猜再看 on, a block's name stays hidden until its first step has been played. The colours come from the service (each block has one), they are not copied here.
   Nothing to play and no scores: the page only reads.
   A disk plugin: plain ESM, no build step, importing only @hermes/plugin-sdk, react and react/jsx-runtime. No outside
   fonts, images or requests.
   The look is its own (design-r3): a true-black ground, #c8ff3d as the accent, grey text no darker than #bdbdbd,
   independent of the workspace's light / dark theme; usable at phone width. */
import { ROUTES_AREA, SIDEBAR_NAV_AREA, SandboxedFrame } from "@hermes/plugin-sdk";
import { createElement as h, createContext, useContext, useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";

const TABS = ["卡组一览", "展开路线", "起手速查", "术语表"];
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

// ---- 作用标签: one coloured chip per tag; the colour comes from the service's 术语表; hovering shows why ----
function RoleChips({ tags, why, small }) {
  const { termColor } = useCardPopup();
  return tags.map((tag) => h("span", { key: tag, className: `yg-role${small ? " small" : ""}`, style: { background: termColor[tag] ?? "#bdbdbd" }, title: why ? `${tag}：${why}` : tag, "data-role": tag }, tag));
}

// ---- one card in the deck list: art, ×count, interrupt chip, Master Duel name, Japanese name ----
function Tile({ rest, card, selected, onClick }) {
  const { bind } = useCardPopup();
  const popup = bind(card.code, card.md);
  // desktop: hover pops the card up, a click toggles the panel beside the list; phone: a tap pops the card up (with 关上), the panel stays closed (one detail UI, not two)
  const click = (e) => { popup.onClick(e); if (!isPhone()) onClick(); };
  return h("button", { ...popup, className: `yg-tile${selected ? " sel" : ""}`, onClick: click, "aria-label": card.md, "aria-pressed": selected },
    h("span", { className: "yg-tile-art" },
      h(CardArt, { rest, code: card.code, md: card.md }),
      card.count > 1 ? h("span", { className: "yg-count" }, `×${card.count}`) : null,
      card.zone === "extra" ? h("span", { className: "yg-tag" }, "额外") : null),
    h("span", { className: "yg-name" }, card.md),
    h("span", { className: "yg-jp" }, card.jp),
    h("span", { className: "yg-roles" }, h(RoleChips, { tags: card.roleTags, why: card.roleWhy, small: true })),
    card.interrupts > 0 ? h("span", { className: "yg-chip on" }, `打断 ${card.interrupts}`) : null);
}

// ---- the card clicked: big art, both names, role, count, the three things, the opponent's turn ----
// the click panel and the popup share this body; onClose null = no 关上 button (the hover popup)
function DetailBody({ rest, card, onClose, stepRole, stepN }) {
  const fact = (label, text) => h("div", { className: "yg-fact" }, h("span", { className: "yg-lab" }, label), h("span", null, text));
  return [
    h("div", { key: "head", className: "yg-detail-head" },
      h(CardArt, { rest, code: card.code, md: card.md, className: "yg-big" }),
      h("div", { className: "yg-col" },
        h("div", { className: "yg-title" }, card.md),
        h("div", { className: "yg-lab" }, card.jp),
        h("div", { className: "yg-row wrap" },
          h(RoleChips, { tags: card.roleTags, why: card.roleWhy }),
          h("span", { className: "yg-chip" }, `${ZONE_NAME[card.zone]} ×${card.count}`)),
        onClose ? h("button", { className: "yg-btn small yg-close", onClick: onClose, "aria-label": "关上" }, "× 关上") : null)),
    h("div", { key: "facts", className: "yg-facts" },
      stepRole ? h("div", { className: "yg-fact yg-rolefact", "data-role-scope": "step" }, h("span", { className: "yg-lab" }, `${stepN ? `第 ${stepN} 步` : "起手"}${stepRole.hand ? " · 手牌" : ""}`), h("span", null, h(RoleChips, { tags: stepRole.tags, why: stepRole.why }), h("span", { className: "yg-why" }, stepRole.why), stepRole.from === "step" || stepRole.hand ? null : h("span", { className: "yg-lab" }, stepRole.from === "carried" ? `（自第 ${stepRole.since} 步起）` : "（默认）")))
        : null,
      card.roleWhy ? h("div", { className: "yg-fact yg-rolefact", "data-role-scope": "default" }, h("span", { className: "yg-lab" }, "默认作用"), h("span", null, h("span", { className: "yg-why" }, card.roleWhy))) : null,
      fact("干什么", card.does),
      fact("条件代价", card.cost),
      fact("限制", card.limit),
      fact("对手回合", card.interrupts > 0 ? `终场时能打断 ${card.interrupts} 次：${card.interruptHow}`
        : card.role === "手坑" ? "从手牌发动，不算终场的打断" : "终场时不提供打断"))];
}
function Detail({ rest, card, onClose }) {
  if (!card) return h("aside", { className: "yg-detail empty", "aria-label": "卡的说明" }, h("p", { className: "yg-lab" }, "点一张卡看效果说明"));
  return h("aside", { className: "yg-detail", "aria-label": "卡的说明" }, h(DetailBody, { rest, card, onClose }));
}

// ---- card popup: hover (desktop) / tap (phone) on any card; one state in the app, one entry point show(code, rect) ----
const CardPopupContext = createContext(null);
const PHONE = "(max-width: 760px), (hover: none)";
const isPhone = () => window.matchMedia(PHONE).matches;
const EDGE = 8, GAP = 12;
// where a w×h popup goes for a card at rect: right of it, else left, clamped inside the window; a window too narrow for either side clamps in place
function placePopup(rect, w, hgt, vw, vh) {
  let left = rect.right + GAP;
  if (left + w > vw - EDGE) left = rect.left - GAP - w;
  left = Math.max(EDGE, Math.min(left, vw - EDGE - w));
  const top = Math.max(EDGE, Math.min(rect.top, vh - EDGE - hgt));
  return { left, top };
}
function CardPopup({ rest, card, rect, onClose, stepRole, stepN }) {
  const ref = useRef(null);
  const phone = isPhone();
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (phone || !ref.current) return;
    const box = ref.current.getBoundingClientRect();
    setPos(placePopup(rect, box.width, box.height, window.innerWidth, window.innerHeight));
  }, [phone, rect, card]);
  const style = phone ? undefined : pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: "hidden" };
  return h("aside", { ref, className: `yg-pop${phone ? " phone" : ""}`, style, "aria-label": "卡的详情", "data-code": String(card.code) },
    h(DetailBody, { rest, card, onClose: phone ? onClose : null, stepRole, stepN }));
}
function CardPopupProvider({ rest, cards, terms, children }) {
  const [pop, setPop] = useState(null); // { code, rect } or null
  const [stepRoles, setStepRoles] = useState(null); // the route player's current step: { n, roles: GET /route steps[].roles } or null
  const hide = useCallback(() => setPop(null), []);
  const show = useCallback((code, rect) => setPop({ code, rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } }), []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") hide(); };
    const onScroll = () => { if (!isPhone()) hide(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("scroll", onScroll, true); };
  }, [hide]);
  // props for a card's element: hover on desktop, tap on a phone
  const bind = useCallback((code, md) => ({
    "data-card-code": String(code), "data-card-md": md,
    onMouseEnter: (e) => { if (!isPhone()) show(code, e.currentTarget.getBoundingClientRect()); },
    onMouseLeave: () => { if (!isPhone()) hide(); },
    onClick: (e) => { if (isPhone()) show(code, e.currentTarget.getBoundingClientRect()); },
  }), [show, hide]);
  const termColor = useMemo(() => Object.fromEntries(terms.map((t) => [t.name, t.color])), [terms]);
  const api = useMemo(() => ({ show, hide, bind, termColor, terms, setStepRoles }), [show, hide, bind, termColor, terms]);
  const card = pop ? cards.find((c) => c.code === pop.code) : null;
  return h(CardPopupContext.Provider, { value: api }, children, card ? h(CardPopup, { rest, card, rect: pop.rect, onClose: hide, stepRole: stepRoles?.roles.find((r) => r.code === card.code), stepN: stepRoles?.n }) : null);
}
const useCardPopup = () => useContext(CardPopupContext);

// ---- 卡组一览: the deck grouped by the first role tag, the clicked card's effect beside (below on a phone) ----
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
      deck.roleTerms.map((role) => {
        const cards = deck.cards.filter((c) => c.roleTags[0] === role.name);
        if (!cards.length) return null;
        return h("section", { key: role.name, className: "yg-group", "aria-label": role.name },
          h("div", { className: "yg-line" }, h("h2", { style: { color: role.color } }, role.name), h("span", { className: "yg-lab" }, `${cards.reduce((n, c) => n + c.count, 0)} 张 · ${role.note}`)),
          h("div", { className: "yg-tiles" }, cards.map((c) => h(Tile, { key: c.code, rest, card: c, selected: c.code === code, onClick: () => setCode(c.code === code ? null : c.code) }))));
      })),
    h(Detail, { rest, card, onClose: () => setCode(null) }));
}

// ---- 术语表: every role word, what it means, its colour ----
function GlossaryView({ deck }) {
  const used = (name) => deck.cards.filter((c) => c.roleTags.includes(name)).length;
  return h("div", { className: "yg-glossary" },
    h("p", { className: "yg-lab yg-sum" }, "路线动画里场上的每张卡（和手牌里的手坑、终场算打断的手牌）都带 1–2 个作用词，悬停（手机点一下）这个词或打开卡片弹窗能看到「此刻为什么是这个作用」。同一张卡在不同路线、不同步骤作用会变。"),
    deck.roleTerms.map((t) => h("section", { key: t.name, className: "yg-term", "aria-label": t.name },
      h("div", { className: "yg-term-head" }, h("span", { className: "yg-role", style: { background: t.color } }, t.name), h("span", { className: "yg-lab" }, used(t.name) ? `默认带这个作用的卡 ${used(t.name)} 种` : "没有默认带它的卡，只在路线某一步出现")),
      h("p", { className: "yg-term-note" }, t.note))));
}

// 中场的卡: every card on the field with its chips and the reason line (a step's roles from GET /route)
// hand: the hand cards with a job this step (GET /route steps[].handRoles), listed after the field with 在手牌里
function MidfieldRoles({ rest, roles, hand = [], n }) {
  const popup = useCardPopup();
  useEffect(() => { popup.setStepRoles({ n, roles: [...roles, ...hand.map((r) => ({ ...r, hand: true }))] }); return () => popup.setStepRoles(null); }, [roles, hand, n]);
  const row = (r, inHand) => h("div", { key: `${inHand ? "h" : "f"}${r.code}`, className: "yg-mrow", "data-card-code": String(r.code) },
    h(Thumb, { rest, card: r, w: 44, h: 64 }),
    h("div", { className: "yg-mtext" },
      h("div", { className: "yg-row wrap" }, h("b", null, r.md), h(RoleChips, { tags: r.tags, why: r.why })),
      h("p", { className: "yg-why" }, r.why),
      inHand ? h("p", { className: "yg-lab" }, "在手牌里") : r.from === "step" ? null : h("p", { className: "yg-lab" }, r.from === "carried" ? `自第 ${r.since} 步起` : "默认作用")));
  return h("div", { className: "yg-mid", "aria-label": "中场的卡和它们此刻的作用" },
    roles.length ? roles.map((r) => row(r, false)) : h("p", { className: "yg-none" }, "中场还没有卡"),
    hand.map((r) => row(r, true)));
}

// ---- 展开路线: the list, then the player ----
// The step panel beside the animation (look: anim-proto c-flat): a progress bar, a big step number, a tag coloured by what the step does,
// the step text, 花了什么 → 换来什么 (rows from the engine's moves), 墓地 / 除外 counts; 起手 and 终场 have their own panels.
// The colours are the animation's (src/anim-stage.js COLOR / ZONE_COLOR / SUMMON_TAG; test/plugin-colors.test.js keeps them the same),
// so a tag reads like the banner on the board: 同调 sky, 融合 pink, 打断 amber.
const COLOR = { cyan: "#22d3ee", amber: "#fbbf24", green: "#4ade80", coral: "#fb7185", violet: "#a78bfa", pink: "#f472b6", sky: "#7dd3fc", white: "#ffffff", mute: "#9a9aa2" };
const ZONE_COLOR = { hand: COLOR.green, monsters: COLOR.cyan, spellTraps: COLOR.amber, grave: COLOR.coral, banished: COLOR.violet, deck: COLOR.mute, extra: COLOR.mute };
const SUMMON_TAG = { fusion: ["融合召唤", COLOR.pink], synchro: ["同调召唤", COLOR.sky], xyz: ["超量召唤", COLOR.violet], link: ["连接召唤", COLOR.cyan], ritual: ["仪式召唤", COLOR.amber] };
const ZONE_SHORT = { hand: "手牌", monsters: "场上", spellTraps: "场上", grave: "墓地", banished: "除外", deck: "卡组", extra: "额外", overlay: "素材" };
const PILES = ["grave", "banished", "deck", "extra"];

// the tag in the panel's corner: a fusion / synchro / … summon in this step takes its colour; anything else is one neutral grey
function stepTag(step) {
  const kind = step.moves.find((m) => SUMMON_TAG[m.summon])?.summon;
  if (kind) return SUMMON_TAG[kind];
  if (step.moves.some((m) => m.summon)) return ["召唤", COLOR.mute];
  if (step.activated.length) return ["发动效果", COLOR.mute];
  return [step.moves.length ? "效果处理" : "推进", COLOR.mute];
}

// 花了什么 → 换来什么 from the step's moves: a card that moves twice in a step (hand → grave → banished) is one row, first place → last place.
// Spent: a card that was in play (hand or field) and went to a pile. Gained: a card that came into the hand or onto the field, or into the grave / banished straight from the deck or the extra deck.
function tradeRows(moves) {
  const rows = [];
  for (const m of moves) {
    if (m.from === m.to) continue;
    const prev = rows.findLast((r) => r.code === m.code && r.to === m.from);
    if (prev) prev.to = m.to;
    else rows.push({ code: m.code, md: m.md, from: m.from, to: m.to });
  }
  const moved = rows.filter((r) => r.from !== r.to);
  return {
    cost: moved.filter((r) => PILES.includes(r.to) && !PILES.includes(r.from)),
    gain: moved.filter((r) => !PILES.includes(r.to) || ((r.from === "deck" || r.from === "extra") && (r.to === "grave" || r.to === "banished"))),
  };
}

function Thumb({ rest, card, w, h: hgt }) {
  const { bind } = useCardPopup();
  return h("span", { ...bind(card.code, card.md), className: "yg-thumb", style: { width: w, height: hgt } }, h(CardArt, { rest, code: card.code, md: card.md }));
}

function TradeCol({ rest, rows, side }) {
  if (!rows.length) return h("div", { className: "yg-col-rows" }, h("div", { className: "yg-none" }, "—"));
  return h("div", { className: "yg-col-rows" }, rows.map((r, i) => h("div", { key: `${r.code}-${i}`, className: `yg-trow ${side}` },
    h(Thumb, { rest, card: r, w: 36, h: 52 }),
    h("div", { className: "yg-trow-text" }, h("b", null, r.md), h("span", { style: { color: ZONE_COLOR[r.to] ?? COLOR.mute } }, `${ZONE_SHORT[r.from]}→${ZONE_SHORT[r.to]}`)))));
}

// 墓地 / 除外 at the bottom of every panel (the animation stacks them, so their cards are named here)
function Piles({ board }) {
  const line = (label, color, cards) => h("p", { className: "yg-pile" }, h("u", { style: { color } }, `${label} ${cards.length} 张`), cards.length ? cards.map((c) => c.md).join("、") : "—");
  return h("div", { className: "yg-piles", "aria-label": "墓地和除外" }, line("墓地", COLOR.coral, board.grave), line("除外", COLOR.violet, board.banished));
}

function PanelHead({ big, numeric, tag, color }) {
  return h("div", { className: "yg-ph-head" },
    h("div", { className: `yg-pnum${numeric ? "" : " word"}` }, big),
    h("span", { className: "yg-ptag", style: { background: color } }, tag));
}

// the engine's own wording, kept but out of the way: folded at the bottom of the panel
function EngineNote({ title, lines }) {
  if (!lines.length) return null;
  return h("details", { className: "yg-engine" }, h("summary", null, title), lines.map((l, i) => h("p", { key: i }, l)));
}

function OpeningPanel({ rest, board, handRoles, blocks }) {
  const popup = useCardPopup();
  useEffect(() => { popup.setStepRoles({ n: 0, roles: handRoles.map((r) => ({ ...r, hand: true })) }); return () => popup.setStepRoles(null); }, [handRoles]);
  const hand = [...board.hand].sort((a, b) => a.sequence - b.sequence);
  const roleOf = (code) => handRoles.find((r) => r.code === code);
  return h("section", { className: "yg-panel", "aria-label": "起手" },
    h(PanelHead, { big: "起手", tag: "先攻", color: COLOR.white }),
    h("p", { className: "yg-ptext" }, `手牌 ${hand.length} 张，从卡组抽出。往后每一步都和上一步比。`),
    h("div", { className: "yg-phd" }, "起手手牌"),
    h("div", { className: "yg-hand" }, hand.map((c, i) => h("div", { key: `${c.code}-${i}`, className: "yg-hc" }, h(Thumb, { rest, card: c, w: 70, h: 101 }), h("span", { className: "yg-hcn" }, c.md),
      roleOf(c.code) ? h("span", { className: "yg-roles" }, h(RoleChips, { tags: roleOf(c.code).tags, why: roleOf(c.code).why, small: true })) : null))),
    blocks ? h(BlockList, { blocks }) : null,
    h(Piles, { board }));
}

// ---- 积木: the route's named pieces (GET /route's blocks: { id, name, color, needs, gives, from, to }) ----
const rangeText = (b) => (b.to > b.from ? `第 ${b.from}–${b.to} 步` : `第 ${b.from} 步`);

// 要什么 → 给什么 (stacked on a phone, side by side from the panel's own width up)
function BlockFlow({ block }) {
  return h("div", { className: "yg-blk-flow", "aria-label": "要什么 → 给什么" },
    h("div", { className: "yg-blk-need" }, h("div", { className: "yg-phd" }, "要什么"), h("p", null, block.needs)),
    h("span", { className: "yg-arrow", "aria-hidden": "true" }, "→"),
    h("div", { className: "yg-blk-give" }, h("div", { className: "yg-phd" }, "给什么"), h("p", null, block.gives)));
}

// the block the step on screen belongs to
function BlockCard({ blocks, n }) {
  const block = blocks.find((b) => b.from <= n && n <= b.to);
  if (!block) return null;
  return h("section", { className: "yg-blk", "data-block": block.id, style: { "--blk": block.color }, "aria-label": "这一步所在的积木" },
    h("div", { className: "yg-blk-head" },
      h("span", { className: "yg-phd" }, "积木"),
      h("b", { className: "yg-blk-name" }, block.name),
      h("span", { className: "yg-lab" }, `${rangeText(block)} · 这块的第 ${n - block.from + 1} / ${block.to - block.from + 1} 步`)),
    h(BlockFlow, { block }));
}

// the 起手 panel: every block of the route in order
function BlockList({ blocks }) {
  return h("div", { className: "yg-bl", "aria-label": "这条路线的积木" },
    h("div", { className: "yg-phd" }, `这条路线由 ${blocks.length} 块积木拼成`),
    blocks.map((b) => h("section", { key: b.from, className: "yg-blk", "data-block": b.id, style: { "--blk": b.color } },
      h("div", { className: "yg-blk-head" }, h("b", { className: "yg-blk-name" }, b.name), h("span", { className: "yg-lab" }, rangeText(b))),
      h(BlockFlow, { block: b }))));
}

function StepPanel({ rest, step, total, blocks }) {
  const [tag, color] = stepTag(step);
  const { cost, gain } = tradeRows(step.moves);
  return h("section", { className: "yg-panel", "aria-label": "这一步" },
    h("div", { className: "yg-pg", "aria-hidden": "true" }, Array.from({ length: total }, (_, i) => h("i", { key: i, className: i + 1 < step.n ? "d" : i + 1 === step.n ? "c" : "" }))),
    h(PanelHead, { big: String(step.n).padStart(2, "0"), numeric: true, tag, color }),
    h("p", { className: "yg-ptext" }, step.text),
    h(BlockCard, { blocks, n: step.n }),
    h("div", { className: "yg-trade", "aria-label": "花了什么 → 换来什么" },
      h("div", { className: "yg-phd" }, "花了什么"), h("span", null), h("div", { className: "yg-phd" }, "换来什么"),
      h(TradeCol, { rest, rows: cost, side: "cost" }), h("span", { className: "yg-arrow", "aria-hidden": "true" }, "→"), h(TradeCol, { rest, rows: gain, side: "gain" })),
    step.activated.length ? h("p", { className: "yg-act" }, `发动了 ${step.activated.map((c) => c.md).join("、")}`) : null,
    h("div", { className: "yg-phd" }, "中场的卡和它们此刻的作用"),
    h(MidfieldRoles, { rest, roles: step.roles, hand: step.handRoles, n: step.n }),
    h(Piles, { board: step.board }),
    h(EngineNote, { title: "引擎里的操作", lines: step.actions }));
}

function EndPanel({ rest, end, step, blocks }) {
  return h("section", { className: "yg-panel yg-end", "aria-label": "终场" },
    h(PanelHead, { big: "终场", tag: "先攻结束", color: COLOR.amber }),
    h("p", { className: "yg-endnum" }, h("b", null, end.interrupts), h("span", null, "个打断")),
    h(BlockCard, { blocks, n: step.n }),
    h("div", { className: "yg-phd" }, "靠这些卡"),
    end.breakers.length ? h("div", { className: "yg-bks" }, end.breakers.map((b) => h("div", { key: b.code, className: "yg-brow" },
      h(Thumb, { rest, card: b, w: 52, h: 75 }),
      h("div", { className: "yg-trow-text" }, h("b", null, `${b.md}${b.copies > 1 ? ` ×${b.copies}` : ""}`), h("span", null, `打断 ${b.interrupts}：${b.interruptHow}`)))))
      : h("p", { className: "yg-none" }, "终场没有打断"),
    h("div", { className: "yg-phd" }, "终场里每张卡的作用"),
    h(MidfieldRoles, { rest, roles: step.roles, hand: step.handRoles, n: step.n }),
    h("p", { className: "yg-pile" }, h("u", { style: { color: COLOR.green } }, `剩余手牌 ${end.hand.length} 张`), end.hand.length ? end.hand.map((c) => c.md).join("、") : "—"),
    h(Piles, { board: end }),
    h(EngineNote, { title: `第 ${step.n} 步：${step.text}`, lines: [...(step.activated.length ? [`发动了 ${step.activated.map((c) => c.md).join("、")}`] : []), ...step.actions] }));
}

// position 0 is 起手 (the opening hand, nothing spent yet); positions 1..total are the route's steps.
// The board is the route animation: a HyperFrames page inside the SDK's SandboxedFrame (src/anim-page.js builds it; the message protocol is listed there).
// 下一步 plays the next step and stops; 上一步 and a step number jump to that step's end frame (no reverse play); 连播 plays on to the end; ← / → keys do the
// same as the buttons (the frame forwards the keys when it has focus). Hovering a card in the frame opens the card popup (a tap on a phone).
function Stage({ anim, frameRef, error }) {
  const marks = anim ? { "data-starts": anim.starts.join(","), "data-ends": anim.ends.join(",") } : {};
  const ratio = anim ? { style: { aspectRatio: `${anim.stage.w} / ${anim.stage.h}` } } : {};
  return h("div", { className: "yg-stage", "aria-label": "路线动画", ...marks, ...ratio },
    error ? h("div", { className: "yg-error", role: "alert" }, error)
      : anim ? h(SandboxedFrame, { ref: frameRef, src: anim.src, title: "路线动画", className: "yg-frame" })
        : h("p", { className: "yg-lab yg-stage-wait" }, "读取动画…"));
}

// 先猜再看 (a player switch, kept in this browser's localStorage; off by default): with it on, a step does not play until the player reveals it
const GUESS_KEY = "yugioh.guess-first";
function readGuess() { try { return window.localStorage.getItem(GUESS_KEY) === "true"; } catch { return false; } }
function writeGuess(on) { try { window.localStorage.setItem(GUESS_KEY, String(on)); } catch { /* storage blocked: the switch still works for this page */ } }

// the paused prompt in the panel's place: only the step number and the question, nothing about the step; a click reveals it (so does the space bar)
function GuessPanel({ n, onReveal }) {
  return h("div", { className: "yg-panel yg-guess-panel" },
    h("button", { className: "yg-guess", onClick: onReveal, },
      h("span", { className: "yg-guess-q" }, `第 ${n} 步：想想下一步做什么？`),
      h("span", { className: "yg-lab" }, "按空格或点一下，看这一步")));
}

function Player({ rest, id, onBack }) {
  const popup = useCardPopup();
  const [route, setRoute] = useState(null);
  const [anim, setAnim] = useState(null);
  const [error, setError] = useState("");
  const [animError, setAnimError] = useState("");
  const [roleTip, setRoleTip] = useState(null); // a chip on the board hovered (phone: tapped): { tags, why, rect } in the page's viewport
  // mode: idle | step (one step playing) | auto (连播). 先猜再看: guess = the switch; pending = paused on the prompt for step index + 1; chain = 连播 is on (it stops at every step's prompt)
  const fresh = () => ({ index: 0, mode: "idle", ready: false, t: 0, mid: false, guess: readGuess(), pending: false, chain: false });
  const shown = (v) => ({ index: v.index, mode: v.mode, ready: v.ready, guess: v.guess, pending: v.pending, chain: v.chain });
  const S = useRef(null); // the same state for the message handlers (mid: paused part-way through a step)
  if (!S.current) S.current = fresh(); // lazily: fresh() reads localStorage
  const [view, setView] = useState(() => shown(S.current));
  const frameRef = useRef(null);
  const playerRef = useRef(null);
  const barRef = useRef(null);
  const ctl = useRef(null);
  const commit = (patch) => { Object.assign(S.current, patch); setView(shown(S.current)); };
  useEffect(() => {
    let live = true;
    setRoute(null); setAnim(null); setError(""); setAnimError(""); S.current = fresh(); setView(shown(S.current));
    rest(`/route?id=${id}`).then((r) => { if (live) setRoute(r); }).catch((e) => { if (live) setError(message(e)); });
    rest(`/route-anim?id=${id}`).then((a) => { if (live) setAnim(a); }).catch((e) => { if (live) setAnimError(message(e)); });
    return () => { live = false; };
  }, [rest, id]);
  const total = route?.steps.length ?? 0;

  const post = (m) => frameRef.current?.contentWindow?.postMessage({ src: "yg-host", ...m }, "*");
  const segAt = (t) => { let k = 0; anim.starts.forEach((s, i) => { if (s <= t + 0.001) k = i; }); return k; };
  const jump = (k) => {
    if (!S.current.ready) return;
    k = Math.max(0, Math.min(total, k));
    popup.hide();
    post({ cmd: "seek", t: anim.ends[k] });
    commit({ index: k, mode: "idle", mid: false, pending: false, chain: false });
  };
  const playStep = () => {
    const from = S.current.index;
    popup.hide();
    post({ cmd: "playRange", from: anim.ends[from], to: anim.ends[from + 1] });
    commit({ index: from + 1, mode: "step", mid: false, pending: false });
  };
  const reveal = () => { if (S.current.ready && S.current.pending) playStep(); };
  const next = () => {
    if (!S.current.ready) return;
    if (S.current.mode !== "idle") jump(segAt(S.current.t));
    else if (S.current.pending) reveal();
    else if (S.current.index < total) { if (S.current.guess) { popup.hide(); commit({ pending: true }); } else playStep(); }
  };
  const prev = () => {
    if (!S.current.ready) return;
    if (S.current.mode !== "idle") jump(segAt(S.current.t) - 1);
    else jump(S.current.index - 1);
  };
  const toggleGuess = () => {
    const on = !S.current.guess;
    writeGuess(on);
    post({ cmd: "keys", space: on });
    // whatever is playing stops where it is (a 连播 must not carry on into the prompts, or past the end with one open)
    if (S.current.mode !== "idle") { post({ cmd: "pause" }); commit({ guess: on, mode: "idle", index: segAt(S.current.t), mid: true, pending: false, chain: false }); }
    else commit({ guess: on, pending: false, chain: false });
  };
  const auto = () => {
    if (!S.current.ready) return;
    popup.hide();
    if (S.current.guess) {
      // 连播 with the switch on stops at every step: it asks, the reveal plays that one step, and when it ends the next ask comes (yg-ended)
      if (S.current.chain) {
        if (S.current.mode !== "idle") { post({ cmd: "pause" }); commit({ mode: "idle", index: segAt(S.current.t), mid: true, chain: false, pending: false }); } else commit({ chain: false, pending: false });
        return;
      }
      const i = S.current.index;
      if (S.current.mid && S.current.t > anim.starts[i] && S.current.t < anim.ends[i]) { post({ cmd: "playRange", from: S.current.t, to: anim.ends[i] }); commit({ mode: "step", mid: false, chain: true }); return; }
      if (i >= total) { post({ cmd: "seek", t: anim.ends[0] }); commit({ index: 0, mid: false, chain: true, pending: true }); return; }
      commit({ chain: true, pending: true, mid: false });
      return;
    }
    if (S.current.mode === "auto") { post({ cmd: "pause" }); commit({ mode: "idle", index: segAt(S.current.t), mid: true }); return; }
    if (S.current.mode === "step") post({ cmd: "pause" });
    let from = S.current.index >= total ? 0 : S.current.index === 0 ? 0 : anim.ends[S.current.index];
    if (S.current.mid && S.current.t > anim.starts[S.current.index] && S.current.t < anim.ends[S.current.index]) from = S.current.t;
    post({ cmd: "playRange", from, to: anim.ends[total] });
    commit({ mode: "auto", mid: false, ...(S.current.index >= total ? { index: 0 } : {}) });
  };
  const onPlayerKey = (key) => {
    if (key === "ArrowLeft") prev();
    if (key === "ArrowRight") next();
    if (key === " ") reveal();
  };
  ctl.current = { onPlayerKey, segAt, anim, total };

  useEffect(() => {
    const onKey = (e) => {
      if (!ctl.current.anim || e.target?.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName ?? "")) return;
      if (e.key === " ") { // on a focused button / link the space bar belongs to it (a native click)
        if (/^(BUTTON|A|SUMMARY)$/.test(e.target?.tagName ?? "")) return;
        if (S.current.pending) e.preventDefault();
      }
      ctl.current.onPlayerKey(e.key);
    };
    const onMessage = (e) => {
      const frame = frameRef.current;
      const d = e.data;
      if (!frame || e.source !== frame.contentWindow || !d || typeof d.type !== "string") return;
      const c = ctl.current;
      if (d.type === "yg-ready") { commit({ ready: true }); post({ cmd: "keys", space: S.current.guess }); post({ cmd: "seek", t: c.anim.ends[S.current.index] }); }
      else if (d.type === "yg-time") {
        S.current.t = d.t;
        if (S.current.mode !== "idle") { const k = c.segAt(d.t); if (k !== S.current.index) commit({ index: k }); }
      } else if (d.type === "yg-ended") { const k = c.segAt(d.t); const more = S.current.chain && k < c.total; commit({ mode: "idle", index: k, mid: false, pending: more, chain: more }); }
      else if (d.type === "yg-error") setAnimError(`动画出错：${d.detail}`);
      else if (d.type === "yg-key") c.onPlayerKey(d.key);
      else if (d.type === "yg-role-hover" || d.type === "yg-role-tap" || d.type === "yg-role-leave") {
        if (d.type === "yg-role-leave") { if (!isPhone()) setRoleTip(null); return; }
        if (d.type === "yg-role-hover" === isPhone()) return; // hover on a desktop, a tap on a phone
        const f = frame.getBoundingClientRect();
        popup.hide();
        setRoleTip({ tags: d.tags, why: d.why, rect: { left: f.left + d.rect.x, top: f.top + d.rect.y, right: f.left + d.rect.x + d.rect.w, bottom: f.top + d.rect.y + d.rect.h } });
      } else if (d.type === "yg-card-hover" || d.type === "yg-card-tap" || d.type === "yg-card-leave") {
        if (d.type === "yg-card-leave") { if (!isPhone()) popup.hide(); return; }
        if (d.type === "yg-card-hover" === isPhone()) return; // hover on a desktop, a tap on a phone
        const f = frame.getBoundingClientRect();
        setRoleTip(null);
        popup.show(d.code, { left: f.left + d.rect.x, top: f.top + d.rect.y, right: f.left + d.rect.x + d.rect.w, bottom: f.top + d.rect.y + d.rect.h });
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("message", onMessage);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("message", onMessage); };
  }, [popup]);

  // --yg-bar = the sticky controls' height: the board's scroll-margin, so scrolling the board into view lands it below the controls, not under them
  useLayoutEffect(() => {
    const bar = barRef.current, player = playerRef.current;
    if (!bar || !player) return undefined;
    const set = () => player.style.setProperty("--yg-bar", `${bar.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(bar);
    return () => ro.disconnect();
  }, [route]);

  useEffect(() => { setRoleTip(null); }, [view.index, view.mode]);
  useEffect(() => {
    if (!roleTip) return undefined;
    const close = (e) => { if (e.type !== "keydown" || e.key === "Escape") setRoleTip(null); };
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", close);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("keydown", close); };
  }, [roleTip]);

  if (error) return h("div", { className: "yg-error", role: "alert" }, error);
  if (!route) return h("p", { className: "yg-lab" }, "读取路线…");
  const { index, mode, guess, pending, chain } = view;
  const opening = index === 0;
  const step = opening ? null : route.steps[index - 1];
  const last = index === total;
  const playing = mode !== "idle";
  const mismatch = [route.mismatch, ...route.engineDiff.map((d) => `引擎重放和教程写的终场不一致：${d}`)].filter(Boolean);
  return h("div", { ref: playerRef, className: "yg-player", "data-step": String(index), "data-total": String(total), "data-mode": mode, "data-ready": String(view.ready), "data-guess": String(guess), "data-pending": String(pending) },
    h("div", { className: "yg-row wrap" },
      h("button", { className: "yg-btn small", onClick: onBack }, "← 路线列表"),
      h("h2", { className: "yg-route-title" }, route.name)),
    h("p", { className: "yg-lab yg-sum" }, "来源 ",
      h("a", { href: route.source.url, target: "_blank", rel: "noopener noreferrer" }, route.source.name),
      ` · 页面版本 ${route.source.date} · 引擎验证于 ${route.verified}`),
    mismatch.length ? h("div", { className: "yg-mismatch", role: "alert" }, h("strong", null, "教程和引擎不一致"), mismatch.map((m, i) => h("p", { key: i }, m))) : null,
    // the step bar and the buttons stay at the top of the scroll area on a desktop, so scrolling down to the board never hides them
    h("div", { ref: barRef, className: "yg-controls" },
      h("div", { className: "yg-stepbar", role: "group", "aria-label": "跳到某一步" },
        h("button", { className: `yg-stepno yg-stepno-start${opening ? " on" : ""}`, onClick: () => jump(0), "aria-label": "起手", "aria-current": opening ? "step" : undefined }, "起手"),
        // one coloured segment per block; with 先猜再看 on a block's name stays hidden until its first step has been played
        route.blocks.map((b) => h("div", { key: b.from, className: "yg-seg", "data-block": b.id, style: { "--blk": b.color } },
          h("span", { className: "yg-segname", "aria-hidden": guess && b.from > index ? "true" : undefined }, guess && b.from > index ? "\u00a0" : b.name),
          h("div", { className: "yg-segnos" }, route.steps.slice(b.from - 1, b.to).map((s) => h("button", { key: s.n, className: `yg-stepno${s.n === index ? " on" : ""}`, onClick: () => jump(s.n), "aria-label": `第 ${s.n} 步`, "aria-current": s.n === index ? "step" : undefined }, String(s.n))))))),
      h("div", { className: "yg-nav" },
        h("button", { className: "yg-btn", disabled: !view.ready || (opening && !playing), onClick: prev }, "上一步"),
        h("button", { className: "yg-btn", disabled: !view.ready || (last && !playing), onClick: next }, "下一步"),
        h("button", { className: `yg-btn${mode === "auto" || chain ? " on" : ""}`, disabled: !view.ready, onClick: auto }, mode === "auto" || chain ? "暂停" : "连播"),
        h("button", { className: `yg-btn yg-toggle${guess ? " on" : ""}`, role: "switch", "aria-checked": String(guess), "aria-label": "先猜再看", onClick: toggleGuess }, "先猜再看"),
        h("span", { className: "yg-lab yg-pos" }, opening ? `起手 · 共 ${total} 步` : `第 ${index} / ${total} 步${last ? " · 终场" : ""}`))),
    h("div", { className: "yg-play" },
      h(Stage, { anim, frameRef, error: animError }),
      pending ? h(GuessPanel, { n: index + 1, onReveal: reveal })
      : opening ? h(OpeningPanel, { rest, board: route.start, handRoles: route.startHandRoles, blocks: guess ? null : route.blocks })
        : last && !playing ? h(EndPanel, { rest, end: route.end, step, blocks: route.blocks })
          : h(StepPanel, { rest, step, total, blocks: route.blocks })),
    roleTip ? h(RoleTip, { ...roleTip, onClose: () => setRoleTip(null) }) : null);
}

// the tip for a chip on the board: the words and the reason, under the chip (above it if there is no room), clamped inside the window; a tap closes it
function RoleTip({ tags, why, rect, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const box = ref.current.getBoundingClientRect();
    const left = Math.max(EDGE, Math.min(rect.left, window.innerWidth - EDGE - box.width));
    const below = rect.bottom + 6;
    setPos({ left, top: below + box.height > window.innerHeight - EDGE ? Math.max(EDGE, rect.top - 6 - box.height) : below });
  }, [rect, why]);
  return h("div", { ref, className: "yg-roletip", role: "tooltip", "aria-label": "这张卡此刻的作用", onClick: onClose, style: pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: "hidden" } },
    h("span", { className: "yg-row wrap" }, h(RoleChips, { tags, why })), h("span", { className: "yg-why" }, why));
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
  const { bind } = useCardPopup();
  const lookup = loaded.data?.lookup;
  if (!lookup) return h("p", { className: "yg-lab" }, "读取速查…");
  return h("div", { className: "yg-lookup" },
    h("p", { className: "yg-lab yg-sum" }, "手里有哪张关键卡，就走哪条路线；缺某张卡时看「缺」那几行。点路线名，打开那条路线的逐步播放。每条路线都在规则引擎里重放过。"),
    lookup.map((e) => h("section", { key: e.card.code, className: "yg-key", "aria-label": e.card.md, "data-card-code": String(e.card.code) },
      h("div", { className: "yg-key-head" },
        h("span", { className: "yg-route-art", ...bind(e.card.code, e.card.md) }, h(CardArt, { rest, code: e.card.code, md: e.card.md })),
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

function YugiohApp({ rest, setDeckInfo }) {
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
      try { const d = await rest("/deck"); setDeck(d); setDeckInfo({ cards: d.cards, terms: d.roleTerms }); } catch (e) { setError(message(e)); }
      setReady(true);
    })();
  }, [rest]);

  let main = null;
  if (tab === "展开路线") main = h(RoutesView, { rest, loaded: routes, id: routeId, setId: setRouteId });
  else if (tab === "起手速查") main = h(LookupView, { rest, loaded: routes, onOpen: (id) => { setRouteId(id); setTab("展开路线"); } });
  else if (tab === "术语表") main = deck ? h(GlossaryView, { deck }) : null;
  else if (deck) main = h(DeckView, { rest, deck });
  return h("div", { className: "yg", "data-ready": ready ? "true" : "false" },
    h("header", { className: "yg-head" }, h("h1", null, "游戏王 · 烙印教程"),
      h("nav", { className: "yg-tabs" }, TABS.map((t) => h("button", { key: t, className: `yg-tab${tab === t ? " on" : ""}`, onClick: () => setTab(t) }, t)))),
    error ? h("div", { className: "yg-error", role: "alert" }, error) : null,
    main);
}
function YugiohRoot({ rest }) {
  const [info, setDeckInfo] = useState({ cards: [], terms: [] });
  return h(CardPopupProvider, { rest, cards: info.cards, terms: info.terms }, h(YugiohApp, { rest, setDeckInfo }));
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
.yg-pop { position: fixed; z-index: 50; width: 680px; max-width: calc(100vw - 16px); max-height: calc(100vh - 16px); overflow-y: auto; pointer-events: none;
  border: 1px solid #c8ff3d; border-radius: 8px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; background: #000; box-shadow: 0 8px 28px rgba(0, 0, 0, .7);
  font-family: "PingFang SC", "Noto Sans SC", system-ui, sans-serif; font-size: 13px; color: #ececec; }
.yg-pop *, .yg-pop *::before { box-sizing: border-box; }
.yg-pop button { font: inherit; color: inherit; cursor: pointer; }
.yg-pop p { margin: 0; }
/* popup = big art on the left (the image is 680×986), names + facts on the right; the head's two parts become grid cells */
.yg-pop { display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto 1fr; column-gap: 18px; row-gap: 10px; align-items: start; }
.yg-pop .yg-detail-head { display: contents; }
.yg-pop .yg-big { grid-row: 1 / span 2; width: auto; height: min(420px, calc(100vh - 48px)); aspect-ratio: 680 / 986; object-fit: contain; }
.yg-pop .yg-col { grid-column: 2; }
.yg-pop .yg-facts { grid-column: 2; }
.yg-pop.phone { pointer-events: auto; left: 0; right: 0; bottom: 0; top: auto; width: auto; max-width: none; max-height: 86vh; border-radius: 12px 12px 0 0; border-color: #3a3a3a;
  grid-template-columns: 1fr; grid-template-rows: none; }
.yg-pop.phone .yg-big { grid-row: auto; justify-self: center; height: auto; width: min(64vw, 300px); }
.yg-pop.phone .yg-col, .yg-pop.phone .yg-facts { grid-column: 1; }
.yg-role { display: inline-block; font-size: 11px; font-weight: 700; line-height: 1.5; padding: 1px 8px; border-radius: 9px; color: #000; white-space: nowrap; letter-spacing: .04em; }
.yg-role.small { font-size: 10px; padding: 0 6px; }
.yg-roles { display: flex; flex-wrap: wrap; justify-content: center; gap: 3px; }
.yg-why { font-size: 13px; line-height: 1.55; color: #e2e2e6; }
.yg-rolefact > span:last-child { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
.yg-mid { display: flex; flex-direction: column; gap: 10px; }
.yg-mrow { display: flex; gap: 10px; align-items: flex-start; padding: 4px 0 4px 10px; border-left: 3px solid #2a2a2a; min-width: 0; }
.yg-mtext { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.yg-mtext b { font-size: 13px; font-weight: 700; color: #ececec; }
.yg-glossary { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr)); gap: 12px; max-width: 1280px; align-items: start; }
.yg-glossary > .yg-sum { grid-column: 1 / -1; }
.yg-roletip { position: fixed; z-index: 60; max-width: min(340px, calc(100vw - 16px)); display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; background: #111; border: 1px solid #3a3a3a; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.6); font-size: 13px; line-height: 1.5; cursor: default; }
.yg-term { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border: 1px solid #2a2a2a; border-radius: 8px; }
.yg-term-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.yg-term .yg-role { font-size: 14px; padding: 2px 12px; }
.yg-term-note { font-size: 14px; line-height: 1.55; }
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
.yg-stepbar { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px 10px; }
.yg-stepno-start { align-self: flex-end; }
.yg-seg { display: flex; flex-direction: column; gap: 3px; border-top: 3px solid var(--blk); padding-top: 2px; min-width: 0; }
.yg-segname { font-size: 11px; font-weight: 700; line-height: 1.3; color: var(--blk); white-space: nowrap; }
.yg-segnos { display: flex; flex-wrap: wrap; gap: 6px; }
.yg-seg .yg-stepno { border-color: var(--blk); }
.yg-seg .yg-stepno.on { background: var(--blk); border-color: var(--blk); }
.yg-blk { display: flex; flex-direction: column; gap: 8px; padding: 8px 0 8px 12px; border-left: 4px solid var(--blk); min-width: 0; }
.yg-blk-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 10px; }
.yg-blk-name { font-size: 17px; font-weight: 800; color: var(--blk); }
.yg-blk-flow { display: grid; grid-template-columns: minmax(0, 1fr) 24px minmax(0, 1fr); column-gap: 8px; align-items: start; }
.yg-blk-flow p { font-size: 13px; line-height: 1.55; color: #e2e2e6; margin-top: 4px; }
.yg-blk-flow .yg-arrow { margin-top: 18px; }
.yg-bl { display: flex; flex-direction: column; gap: 10px; }
.yg-stepno { min-width: 34px; height: 34px; border-radius: 5px; border: 1px solid #3a3a3a; background: none; padding: 0 6px; }
.yg-stepno.on { background: #c8ff3d; border-color: #c8ff3d; color: #000; font-weight: 600; }
.yg-nav { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; } .yg-nav .yg-btn { white-space: nowrap; }
.yg-btn:disabled { opacity: .35; cursor: default; }
.yg-player { container-type: inline-size; }
.yg-play { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; }
@container (min-width: 1040px) { .yg-play { grid-template-columns: minmax(0, 700px) minmax(0, 1fr); align-items: start; } }
.yg-stage { position: relative; width: 100%; max-width: 800px; aspect-ratio: 800 / 859; background: #000; border: 1px solid #1f1f1f; border-radius: 8px; overflow: hidden; }
.yg-stage .yg-frame { width: 100%; height: 100%; border: 0; display: block; }
.yg-stage-wait { padding: 16px; }
.yg-controls { display: flex; flex-direction: column; gap: 14px; }
@media (min-width: 761px) { .yg-controls { position: sticky; top: 0; z-index: 4; background: #000; padding: 8px 0; margin: -8px 0; } .yg-stage { scroll-margin-top: calc(var(--yg-bar, 0px) + 8px); } }
.yg-panel { position: relative; display: flex; flex-direction: column; gap: 14px; min-width: 0; max-width: 520px; padding-top: 4px; }
.yg-pg { display: flex; gap: 4px; height: 6px; }
.yg-pg i { flex: 1; background: #202025; } .yg-pg i.d { background: #fff; } .yg-pg i.c { background: #fbbf24; }
.yg-ph-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.yg-pnum { font-family: "Helvetica Neue", Arial, system-ui, sans-serif; font-size: 104px; font-weight: 900; line-height: .92; letter-spacing: -4px; color: #fff; }
.yg-pnum.word { font-family: inherit; font-size: 72px; letter-spacing: 2px; line-height: 1.05; }
.yg-ptag { flex: none; margin-top: 10px; height: 30px; line-height: 30px; padding: 0 14px; border-radius: 3px; color: #000; font-weight: 800; font-size: 14px; letter-spacing: 2px; white-space: nowrap; }
.yg-ptext { font-size: 20px; line-height: 1.45; font-weight: 600; color: #f3f3f5; }
.yg-phd { font-size: 12px; letter-spacing: 3px; color: #bdbdbd; font-weight: 700; }
.yg-trade { display: grid; grid-template-columns: minmax(0, 1fr) 28px minmax(0, 1fr); column-gap: 8px; row-gap: 10px; align-items: start; margin-top: 6px; }
.yg-arrow { align-self: center; text-align: center; font-size: 24px; font-weight: 800; color: #5a5a62; }
.yg-col-rows { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.yg-trow, .yg-brow { position: relative; display: flex; align-items: center; gap: 10px; padding: 4px 0 4px 12px; min-width: 0; }
.yg-trow::before, .yg-brow::before { content: ""; position: absolute; left: 0; top: 4px; bottom: 4px; width: 3px; background: #22d3ee; }
.yg-trow.cost::before { background: #fb7185; }
.yg-brow::before { background: #fbbf24; }
.yg-brow { align-items: flex-start; gap: 14px; }
.yg-thumb { position: relative; flex: none; display: block; cursor: default; }
.yg-trow-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.yg-trow-text b { font-size: 13px; line-height: 1.3; font-weight: 700; color: #ececec; }
.yg-trow-text span { font-size: 11px; font-weight: 700; letter-spacing: 1px; }
.yg-brow .yg-trow-text b { font-size: 16px; font-weight: 800; }
.yg-brow .yg-trow-text span { font-size: 12.5px; line-height: 1.5; font-weight: 400; letter-spacing: 0; color: #c7c7cd; }
.yg-none { color: #4a4a52; font-size: 20px; padding-left: 12px; }
.yg-act { font-size: 12px; color: #bdbdbd; }
.yg-hand { display: flex; flex-wrap: wrap; gap: 8px; }
.yg-hc { width: 70px; display: flex; flex-direction: column; gap: 6px; }
.yg-hc .yg-roles { justify-content: flex-start; }
.yg-hcn { font-size: 12px; line-height: 1.2; color: #cfcfd4; }
.yg-piles { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.yg-pile { font-size: 12px; line-height: 1.5; color: #bdbdbd; }
.yg-pile u { text-decoration: none; font-weight: 800; margin-right: 8px; letter-spacing: 1px; }
.yg-endnum { line-height: 1; }
.yg-endnum b { font-family: "Helvetica Neue", Arial, system-ui, sans-serif; font-size: 120px; line-height: 1; font-weight: 900; color: #fbbf24; }
.yg-endnum span { font-size: 30px; font-weight: 800; margin-left: 14px; }
.yg-bks { display: flex; flex-direction: column; gap: 12px; }
.yg-engine { font-size: 11px; color: #8b8b93; line-height: 1.6; border-top: 1px solid #1c1c1c; padding-top: 8px; }
.yg-engine summary { cursor: pointer; color: #8b8b93; }
.yg-engine p { margin: 0; }
.yg-guess-panel { justify-content: center; }
.yg-guess { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; text-align: left; padding: 28px 20px; border: 2px dashed #c8ff3d; border-radius: 8px; background: #000; min-height: 140px; justify-content: center; }
.yg-guess-q { font-size: 22px; font-weight: 700; line-height: 1.4; }
.yg-btn.on { background: #c8ff3d; color: #000; border-color: #c8ff3d; }
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
  .yg-route-art { width: 52px; }
  .yg-pnum { font-size: 72px; letter-spacing: -2px; } .yg-pnum.word { font-size: 52px; }
  .yg-ptext { font-size: 17px; }
  .yg-blk-flow { grid-template-columns: minmax(0, 1fr); row-gap: 4px; } .yg-blk-flow .yg-arrow { margin: 0; text-align: left; transform: rotate(90deg); width: 24px; }
  .yg-endnum b { font-size: 84px; }
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
      { id: "page", area: ROUTES_AREA, data: { path: "/yugioh" }, render: () => h(YugiohRoot, { rest }) },
      { id: "nav", area: SIDEBAR_NAV_AREA, data: { path: "/yugioh", label: "游戏王", codicon: "game" } },
    ]);
  },
};
