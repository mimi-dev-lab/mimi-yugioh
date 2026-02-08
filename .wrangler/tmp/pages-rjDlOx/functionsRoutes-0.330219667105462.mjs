import { onRequestGet as __api_cards_external_ts_onRequestGet } from "/Users/lifan/clawd/projects/mimi-yugioh/functions/api/cards/external.ts"
import { onRequestGet as __api_cards_names_ts_onRequestGet } from "/Users/lifan/clawd/projects/mimi-yugioh/functions/api/cards/names.ts"
import { onRequestPost as __api_cards_resolve_ts_onRequestPost } from "/Users/lifan/clawd/projects/mimi-yugioh/functions/api/cards/resolve.ts"
import { onRequestGet as __api_cards__id__ts_onRequestGet } from "/Users/lifan/clawd/projects/mimi-yugioh/functions/api/cards/[id].ts"
import { onRequestGet as __api_decks__id__ts_onRequestGet } from "/Users/lifan/clawd/projects/mimi-yugioh/functions/api/decks/[id].ts"
import { onRequestGet as __api_cards_index_ts_onRequestGet } from "/Users/lifan/clawd/projects/mimi-yugioh/functions/api/cards/index.ts"
import { onRequestGet as __api_decks_index_ts_onRequestGet } from "/Users/lifan/clawd/projects/mimi-yugioh/functions/api/decks/index.ts"

export const routes = [
    {
      routePath: "/api/cards/external",
      mountPath: "/api/cards",
      method: "GET",
      middlewares: [],
      modules: [__api_cards_external_ts_onRequestGet],
    },
  {
      routePath: "/api/cards/names",
      mountPath: "/api/cards",
      method: "GET",
      middlewares: [],
      modules: [__api_cards_names_ts_onRequestGet],
    },
  {
      routePath: "/api/cards/resolve",
      mountPath: "/api/cards",
      method: "POST",
      middlewares: [],
      modules: [__api_cards_resolve_ts_onRequestPost],
    },
  {
      routePath: "/api/cards/:id",
      mountPath: "/api/cards",
      method: "GET",
      middlewares: [],
      modules: [__api_cards__id__ts_onRequestGet],
    },
  {
      routePath: "/api/decks/:id",
      mountPath: "/api/decks",
      method: "GET",
      middlewares: [],
      modules: [__api_decks__id__ts_onRequestGet],
    },
  {
      routePath: "/api/cards",
      mountPath: "/api/cards",
      method: "GET",
      middlewares: [],
      modules: [__api_cards_index_ts_onRequestGet],
    },
  {
      routePath: "/api/decks",
      mountPath: "/api/decks",
      method: "GET",
      middlewares: [],
      modules: [__api_decks_index_ts_onRequestGet],
    },
  ]