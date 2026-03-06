# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AllmyAlts** is a World of Warcraft character management dashboard. It integrates with Blizzard's Battle.net OAuth and WoW Profile APIs to display character alts, equipment (with WoW-style tooltips), and reputation tracking across multiple accounts/realms.

## Running the App

```bash
pip install -r requirements.txt
python main.py
```

- Runs on `0.0.0.0:8000` with Flask debug mode
- Requires a Redis server at `allmyalts-redis:6379`
- Requires a `.env` file with `CLIENT_ID`, `CLIENT_SECRET`, `SECRET_KEY`, `CALLBACK_URL` (Blizzard OAuth credentials)
- Auto-creates `cache/images/` on startup

There are no automated tests.

## Architecture

**Single-file Flask backend** (`main.py`, ~715 lines) with Jinja2 templates and vanilla JS/jQuery frontend.

### Data Flow

1. User authenticates via Blizzard OAuth (`/login` → `/callback`)
2. Browser calls POST endpoints (`/get_alts`, `/get_reps`, `/get_alt_detail`) which fetch from Blizzard APIs
3. Real-time progress is streamed back via SSE (`/updates` endpoint using a global queue)
4. Character images are proxied and cached to disk (`/cached-image`)

### Caching Layers

- **Redis** (`allmyalts-redis:6379`): API response cache keyed by URL — 12-hour TTL for profile data, no TTL for static/game data
- **Disk** (`cache/images/`): Character avatar/portrait images, 1-hour TTL, MD5-hashed filenames

### Key Backend Functions

- `blizzard_api_request(url, token)` — unified Blizzard API caller with Redis caching and token expiry handling
- `process_equipped_items()` — extracts equipment from API response and calls `build_tooltip()`
- `build_tooltip()` — constructs WoW-style item tooltip HTML (quality colors, stats, sockets, etc.)
- `get_valid_token()` / `set_token()` / `is_token_expired()` — OAuth token lifecycle via session

### Frontend

Templates in `templates/` extend `layout.html` (navbar, modal overlay, SSE listener, particles). Key JS files:
- `static/alts.js` — character card/table view, sorting, filtering
- `static/reps.js` — reputation filtering by expansion, tier visualization
- `static/alt-detail.js` — equipment modal interactions

CSS uses custom properties for WoW class colors (12 classes), faction colors (Horde/Alliance), reputation tier gradients, and a dark theme with accent pink `#ec008c`.

### Token Management

OAuth tokens are stored in Flask session. `blizzard_api_request()` checks expiry and auto-redirects to `/login` on 401. The callback endpoint handles token exchange and stores expiry timestamp.
