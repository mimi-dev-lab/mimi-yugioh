# mimi-yugioh — Coding Rules

## Stack
- Next.js 16 (App Router) + TypeScript
- Tailwind CSS 4 + shadcn/ui + Radix UI
- Supabase for data
- pnpm

## Coding Rules
- Pages: `app/*/page.tsx` (no `src/` prefix!)
- Components: `components/*.tsx`
- API routes: `app/api/*/route.ts`
- Data files: `data/*.json`
- Scripts: `scripts/` (data generation/import)
- Icons: lucide-react only — no emoji in UI code
- Styling: Tailwind + `cn()` utility

## Commands
- Dev: `pnpm dev`
- Build: `pnpm build`
- Lint: `pnpm lint`
- Docker: `docker compose up --build` (port 3333)

## Deployment
- Docker (local Mac Air), port 3333
- Card images mounted as volume from `~/clawd/projects/yugioh_cards/images`

## Known Pitfalls
- No `src/` directory — `app/` and `components/` at project root
- Card images are external (volume mount), not in the repo
- Use `host.docker.internal` for Supabase from Docker

## Commits
- Follow conventional commits format
