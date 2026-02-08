var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// api/cards/external.ts
var onRequestGet = /* @__PURE__ */ __name(async (context) => {
  const url = new URL(context.request.url);
  const name = url.searchParams.get("name");
  if (!name) {
    return Response.json({ error: "Missing name parameter" }, { status: 400 });
  }
  try {
    const apiUrl = `https://db.ygoprodeck.com/api/v7/cardinfo.php?name=${encodeURIComponent(name)}`;
    const res = await fetch(apiUrl);
    if (!res.ok) {
      return Response.json({ error: "Card not found" }, { status: 404 });
    }
    const data = await res.json();
    if (data.data && data.data[0]) {
      const card = data.data[0];
      return Response.json({
        id: card.id,
        name: card.name
      });
    }
    return Response.json({ error: "Card not found" }, { status: 404 });
  } catch (err) {
    return Response.json({ error: "API request failed" }, { status: 500 });
  }
}, "onRequestGet");

// api/cards/names.ts
var onRequestGet2 = /* @__PURE__ */ __name(async (context) => {
  const { results } = await context.env.DB.prepare(
    `SELECT id, name_cn FROM cards WHERE name_cn IS NOT NULL AND name_cn != ''`
  ).all();
  const names = {};
  for (const row of results || []) {
    const nameCn = row.name_cn;
    const id = row.id;
    names[nameCn] = id;
  }
  return Response.json(
    { names, count: Object.keys(names).length },
    {
      headers: {
        "Cache-Control": "public, max-age=3600"
        // 缓存1小时
      }
    }
  );
}, "onRequestGet");

// api/cards/resolve.ts
var R2_BASE = "https://pub-1aabbe3759be4cbb807f84c6b342a168.r2.dev";
function enrichCard(card) {
  return {
    ...card,
    image_cn: `${R2_BASE}/cn/${card.id}.webp`,
    image_jp: `${R2_BASE}/jp/${card.id}.webp`
  };
}
__name(enrichCard, "enrichCard");
var onRequestPost = /* @__PURE__ */ __name(async (context) => {
  const body = await context.request.json();
  const names = body.names || [];
  if (names.length === 0) {
    return Response.json({ resolved: [], notFound: [] });
  }
  if (names.length > 200) {
    return Response.json({ error: "Too many names (max 200)" }, { status: 400 });
  }
  const placeholders = names.map(() => "?").join(",");
  const { results } = await context.env.DB.prepare(
    `SELECT * FROM cards WHERE name_cn IN (${placeholders})`
  ).bind(...names).all();
  const foundMap = /* @__PURE__ */ new Map();
  results?.forEach((card) => {
    foundMap.set(card.name_cn, enrichCard(card));
  });
  const resolved = [];
  const notFound = [];
  for (const name of names) {
    const card = foundMap.get(name);
    if (card) {
      resolved.push(card);
    } else {
      notFound.push(name);
    }
  }
  return Response.json({ resolved, notFound });
}, "onRequestPost");

// api/cards/[id].ts
var R2_BASE2 = "https://pub-1aabbe3759be4cbb807f84c6b342a168.r2.dev";
function enrichCard2(card) {
  return {
    ...card,
    image_cn: `${R2_BASE2}/cn/${card.id}.webp`,
    image_jp: `${R2_BASE2}/jp/${card.id}.webp`
  };
}
__name(enrichCard2, "enrichCard");
var onRequestGet3 = /* @__PURE__ */ __name(async (context) => {
  const id = context.params.id;
  const card = await context.env.DB.prepare("SELECT * FROM cards WHERE id = ?").bind(id).first();
  if (!card) {
    return Response.json({ error: "Card not found" }, { status: 404 });
  }
  return Response.json(enrichCard2(card));
}, "onRequestGet");

// api/decks/[id].ts
var R2_BASE3 = "https://pub-1aabbe3759be4cbb807f84c6b342a168.r2.dev";
var onRequestGet4 = /* @__PURE__ */ __name(async (context) => {
  const id = context.params.id;
  const deck = await context.env.DB.prepare("SELECT * FROM decks WHERE id = ?").bind(id).first();
  if (!deck) {
    return Response.json({ error: "Deck not found" }, { status: 404 });
  }
  return Response.json({
    ...deck,
    tags: deck.tags ? JSON.parse(deck.tags) : [],
    thumbnail: deck.thumbnail_card_id ? `${R2_BASE3}/cn/${deck.thumbnail_card_id}.webp` : null
  });
}, "onRequestGet");

// api/cards/index.ts
var R2_BASE4 = "https://pub-1aabbe3759be4cbb807f84c6b342a168.r2.dev";
function enrichCard3(card) {
  return {
    ...card,
    image_cn: `${R2_BASE4}/cn/${card.id}.webp`,
    image_jp: `${R2_BASE4}/jp/${card.id}.webp`
  };
}
__name(enrichCard3, "enrichCard");
function getFrameConditions(frames) {
  const conditions = [];
  for (const frame of frames) {
    switch (frame) {
      case "\u9B54\u6CD5":
        conditions.push("type LIKE '%Spell%'");
        break;
      case "\u9677\u9631":
        conditions.push("type LIKE '%Trap%'");
        break;
      case "\u8FDE\u63A5":
        conditions.push("type LIKE '%Link%'");
        break;
      case "\u8D85\u91CF":
        conditions.push("type LIKE '%Xyz%'");
        break;
      case "\u540C\u6B65":
        conditions.push("type LIKE '%Synchro%'");
        break;
      case "\u878D\u5408":
        conditions.push("type LIKE '%Fusion%'");
        break;
      case "\u4EEA\u5F0F":
        conditions.push("(type LIKE '%Ritual%' AND type LIKE '%Monster%')");
        break;
      case "\u7075\u6446":
        conditions.push("type LIKE '%Pendulum%'");
        break;
      case "\u901A\u5E38":
        conditions.push("(type LIKE '%Normal%' AND type LIKE '%Monster%' AND type NOT LIKE '%Spell%' AND type NOT LIKE '%Trap%')");
        break;
      case "\u6548\u679C":
        conditions.push("(type LIKE '%Effect%' AND type NOT LIKE '%Pendulum%' AND type NOT LIKE '%Link%' AND type NOT LIKE '%Xyz%' AND type NOT LIKE '%Synchro%' AND type NOT LIKE '%Fusion%')");
        break;
    }
  }
  return conditions;
}
__name(getFrameConditions, "getFrameConditions");
function getSpellTrapConditions(types) {
  const conditions = [];
  for (const t of types) {
    switch (t) {
      case "normal_spell":
        conditions.push("(type LIKE '%Spell%' AND race = 'Normal')");
        break;
      case "field_spell":
        conditions.push("(type LIKE '%Spell%' AND race = 'Field')");
        break;
      case "equip_spell":
        conditions.push("(type LIKE '%Spell%' AND race = 'Equip')");
        break;
      case "continuous_spell":
        conditions.push("(type LIKE '%Spell%' AND race = 'Continuous')");
        break;
      case "quickplay_spell":
        conditions.push("(type LIKE '%Spell%' AND race = 'Quick-Play')");
        break;
      case "ritual_spell":
        conditions.push("(type LIKE '%Spell%' AND race = 'Ritual')");
        break;
      case "normal_trap":
        conditions.push("(type LIKE '%Trap%' AND race = 'Normal')");
        break;
      case "continuous_trap":
        conditions.push("(type LIKE '%Trap%' AND race = 'Continuous')");
        break;
      case "counter_trap":
        conditions.push("(type LIKE '%Trap%' AND race = 'Counter')");
        break;
    }
  }
  return conditions;
}
__name(getSpellTrapConditions, "getSpellTrapConditions");
var onRequestGet5 = /* @__PURE__ */ __name(async (context) => {
  const url = new URL(context.request.url);
  const q = url.searchParams.get("q") || "";
  const frames = url.searchParams.get("frames")?.split(",").filter(Boolean) || [];
  const attributes = url.searchParams.get("attributes")?.split(",").filter(Boolean) || [];
  const races = url.searchParams.get("races")?.split(",").filter(Boolean) || [];
  const spellTrapTypes = url.searchParams.get("spellTrapTypes")?.split(",").filter(Boolean) || [];
  const levels = url.searchParams.get("levels")?.split(",").map(Number).filter((n) => !isNaN(n)) || [];
  const atkMin = url.searchParams.get("atkMin");
  const atkMax = url.searchParams.get("atkMax");
  const defMin = url.searchParams.get("defMin");
  const defMax = url.searchParams.get("defMax");
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "48"), 100);
  const offset = (page - 1) * limit;
  const conditions = ["1=1"];
  const params = [];
  if (q) {
    conditions.push("(name_cn LIKE ? OR name LIKE ? OR name_jp LIKE ? OR desc_cn LIKE ?)");
    const searchTerm = `%${q}%`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm);
  }
  if (frames.length > 0) {
    const frameConditions = getFrameConditions(frames);
    if (frameConditions.length > 0) {
      conditions.push(`(${frameConditions.join(" OR ")})`);
    }
  }
  if (attributes.length > 0) {
    const placeholders = attributes.map(() => "?").join(",");
    conditions.push(`attribute IN (${placeholders})`);
    params.push(...attributes);
  }
  if (races.length > 0) {
    const placeholders = races.map(() => "?").join(",");
    conditions.push(`(race IN (${placeholders}) AND type LIKE '%Monster%')`);
    params.push(...races);
  }
  if (spellTrapTypes.length > 0) {
    const stConditions = getSpellTrapConditions(spellTrapTypes);
    if (stConditions.length > 0) {
      conditions.push(`(${stConditions.join(" OR ")})`);
    }
  }
  if (levels.length > 0) {
    const placeholders = levels.map(() => "?").join(",");
    conditions.push(`level IN (${placeholders})`);
    params.push(...levels);
  }
  if (atkMin) {
    conditions.push("atk >= ?");
    params.push(parseInt(atkMin));
  }
  if (atkMax) {
    conditions.push("atk <= ?");
    params.push(parseInt(atkMax));
  }
  if (defMin) {
    conditions.push("def >= ?");
    params.push(parseInt(defMin));
  }
  if (defMax) {
    conditions.push("def <= ?");
    params.push(parseInt(defMax));
  }
  const whereClause = conditions.join(" AND ");
  const countQuery = `SELECT COUNT(*) as total FROM cards WHERE ${whereClause}`;
  const countResult = await context.env.DB.prepare(countQuery).bind(...params).first();
  const query = `SELECT * FROM cards WHERE ${whereClause} ORDER BY id LIMIT ? OFFSET ?`;
  const { results } = await context.env.DB.prepare(query).bind(...params, limit, offset).all();
  return Response.json({
    cards: results?.map(enrichCard3) || [],
    pagination: {
      page,
      limit,
      total: countResult?.total || 0,
      totalPages: Math.ceil((countResult?.total || 0) / limit)
    }
  });
}, "onRequestGet");

// api/decks/index.ts
var R2_BASE5 = "https://pub-1aabbe3759be4cbb807f84c6b342a168.r2.dev";
var onRequestGet6 = /* @__PURE__ */ __name(async (context) => {
  const url = new URL(context.request.url);
  const tier = url.searchParams.get("tier");
  const tag = url.searchParams.get("tag");
  let query = "SELECT * FROM decks WHERE 1=1";
  const params = [];
  if (tier) {
    query += " AND tier = ?";
    params.push(tier);
  }
  if (tag) {
    query += " AND tags LIKE ?";
    params.push(`%"${tag}"%`);
  }
  query += " ORDER BY updated_at DESC";
  const { results } = await context.env.DB.prepare(query).bind(...params).all();
  const decks = results?.map((deck) => ({
    ...deck,
    tags: deck.tags ? JSON.parse(deck.tags) : [],
    thumbnail: deck.thumbnail_card_id ? `${R2_BASE5}/cn/${deck.thumbnail_card_id}.webp` : null
  })) || [];
  return Response.json({ decks });
}, "onRequestGet");

// ../.wrangler/tmp/pages-rjDlOx/functionsRoutes-0.330219667105462.mjs
var routes = [
  {
    routePath: "/api/cards/external",
    mountPath: "/api/cards",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/cards/names",
    mountPath: "/api/cards",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/api/cards/resolve",
    mountPath: "/api/cards",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/cards/:id",
    mountPath: "/api/cards",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet3]
  },
  {
    routePath: "/api/decks/:id",
    mountPath: "/api/decks",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet4]
  },
  {
    routePath: "/api/cards",
    mountPath: "/api/cards",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet5]
  },
  {
    routePath: "/api/decks",
    mountPath: "/api/decks",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet6]
  }
];

// ../../../../.npm/_npx/32026684e21afda6/node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../../../../.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
export {
  pages_template_worker_default as default
};
