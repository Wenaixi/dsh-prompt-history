<div align="center">

# ⌨️ @wenaixi/dsh-prompt-history

**Terminal-style input for the DeepSeek Harness Web GUI composer — Claude Code-style prompt history, copy & quote, and right-click paste.**

*Press ↑ like it's a terminal — history, quoting and pasting in one plugin.*

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH plugin](https://img.shields.io/badge/dsh-plugin-✅-green)](https://github.com/topics/dsh-plugin)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](#)
[![npm version](https://img.shields.io/npm/v/@wenaixi/dsh-prompt-history)](https://www.npmjs.com/package/@wenaixi/dsh-prompt-history)
[![npm downloads](https://img.shields.io/npm/dm/@wenaixi/dsh-prompt-history)](https://www.npmjs.com/package/@wenaixi/dsh-prompt-history)

**English** · [简体中文](README.zh.md)

</div>

---

## Compatibility

| Surface | Status |
|---|---|
| DSH versions | Targets **0.2.0-rc.2**; the configuration card uses `plugins.bundle.config` with the Host `Config` schema and a self-drawn shell (write-on-change, no Save button) |
| Platform | Web GUI only (client plugin; settings are persisted by the DSH Host, cross-session history stays in browser local storage) |
| Node | `>=20` |
| Model | Any (no model requests — pure UI behavior) |
| UI language | 中文 / English (follows the DSH app locale) |

## What you get

`@wenaixi/dsh-prompt-history` puts a terminal's input history into the DeepSeek Harness Web GUI composer:

1. **Claude Code-style arrow recall** — with the caret on the **first line** of the draft, **Up** walks back through prompts one by one from the most recent (caret parks at the start of each recalled line); at the oldest entry Up does nothing (no wrap-around). **Down** walks forward (recalled lines park the caret at the end) and, at the bottom edge, **restores the line you were typing before browsing began** (an empty draft restores an empty line). In multi-line drafts, Up/Down still move the caret normally unless it is on the first/last line.
2. **Edit exits browsing** — editing the draft while browsing drops back to the live line.
3. **History list via double Escape** — with an empty draft, pressing **Escape twice within 800 ms** opens the full prompt-history overlay (newest first, duplicates keep only their latest occurrence). Focus stays in the input: typing filters live with substring plus optional fuzzy subsequence matching (default on), **↑↓** move the highlight without touching the draft (clamped at the edges, no wrap), Home/End jump to the edges, **Enter or Tab** fills the highlighted entry, **Esc** closes and restores the draft from before opening. Each row shows a relative timestamp when the setting is on; on wide windows (≥1000px) the selected entry previews in full on the right. The footer shows "matches / total" live.
4. **Double Escape** (toggleable in Settings, default on) — matches Claude Code semantics: with a **non-empty** draft the first Escape hints "Esc again to clear" and passes through, the second within 800 ms **saves the draft to history and clears the input** (the cleared text is then recallable with Up); with an **empty** draft a double Escape opens the history list. Turning the toggle off hands every Escape back to the Host.
5. **Copy + quote (two modes, in Settings)** — any non-empty selection in the page — the composer input, chat messages, code blocks — is handled per the chosen mode:
   - **Toolbar** (default): Copy / Quote buttons appear above the selection — copy writes the clipboard only on click (no Win+V flooding); **Quote** inserts the FULL selected text as a clean `>`-prefixed markdown blockquote into the composer (rendered as a blockquote when sent).
   - **Auto** (terminal-style): copies the selection straight to the system clipboard on select.
6. **Right-click pastes directly** — a right-click on the composer pastes the clipboard — no context menu, like a Linux terminal. Paste runs the same pipeline as Ctrl+V (images and reference chips behave identically), with a Clipboard API fallback when the execCommand path is blocked.
7. **Cross-session history** (Settings toggle, default off) — keeps Up/Down history across sessions, stored in browser localStorage (capped by the max-history setting), survives reloads and session switches.

Pure UI behavior: no session events, no agent-loop changes, no model requests. Recalled or quoted text only enters the ordinary composer draft — it reaches the model only if *you* press Enter.

## Quick start

```sh
# 1. install the bundle into your profile
dsh plugin --profile web add @wenaixi/dsh-prompt-history

# 2. refresh the page — no service restart needed
```

## Install & uninstall

- **npm channel** (published releases): `dsh plugin --profile web add @wenaixi/dsh-prompt-history`
- **git channel** (local dev, latest `main`): `dsh plugin --profile web add "github:Wenaixi/dsh-prompt-history#main"` (a source checkout must be built first — `pnpm run build`; an unbuilt bundle refuses to boot)
- **uninstall**: `dsh plugin --profile web remove @wenaixi/dsh-prompt-history`

## Configuration

Open **Plugins → `@wenaixi/dsh-prompt-history` → configuration** (persisted by the DSH Host into `cordis.patch.yml`; legacy browser settings migrate on first open). Changes save immediately — there is no Save button: every toggle, option pick, or "Restore defaults" click writes the Host at once.

| Option | Default | Meaning |
|---|---|---|
| After selecting text | `Show a toolbar` | `Nothing` / `Show a toolbar` (writes the clipboard only on click) / `Copy immediately` (terminal-style) |
| Up/Down history | On | Off hands every history behavior back to the Host |
| Double Escape | On | Off hands every Escape back to the Host (no clear, no history list) |
| Max history entries | `100` | How many prompts Up/Down and the history list remember (50 / 100 / 200 / 500 / 1000) |
| Relative time | On | Show "5m / 3h / 2d" at the start of each history-list row |
| Fuzzy match | On | History-list filtering also matches character subsequences (e.g. "dpl" finds "deploy now") |
| Cross-session memory | Off | Up/Down history persists across sessions in browser local storage (capped by max history) |
| Right-click paste | On | Off restores the browser's native context menu |

## Features

- **History comes from the session's own message log**: reads the conversation snapshot's user nodes (`user` / `steering`) and appends as they land — strictly consistent with the transcript, persisted with the session, survives page reloads, and needs no configuration or extra storage. With "Cross-session memory" on it seeds from browser localStorage (capped by the max-history setting) and dedupes against the whole ring on every append.
- **Consecutive duplicates collapse**; browse state resets on session switch.
- **Inline slash completion survives a claimed command**: the DSH Host suppresses every `/` trigger while a leading command owns the draft (`/plan ` puts the composer in its `claimed` phase), so on a stock Host typing `/plan /browser-harness` shows nothing. This plugin widens that guard back to `plain` whenever the caret sits on an inline slash, which is what makes `/plan /skill-name` suggestions work as you'd expect.
- Fully localized (中文 / English): settings, toolbar, feedback pills, history list all follow the DSH app locale.
- The client bundle is ~25 KB gzipped and depends only on the official `@deepseek-ai/*` peer packages.

## Known limitations

- **Ctrl+R is not bound** — the browser keeps its native refresh; the history list opens via double Escape (or the Up/Down recall for one entry at a time).
- Plain text only: image-only or chip-bearing messages are not recalled; recalled drafts are plain text.
- Multi-line detection works on logical lines (Lexical line-breaks are `<br>`): pressing Up on a visually wrapped single line enters history instead of moving the caret up one visual row.

## Development

```sh
pnpm install
pnpm run typecheck   # tsc --noEmit
pnpm run build       # tsc (lib/types) + tsdown (lib/index.js / lib/invariant.js / lib/client.js)
```

The browser half (`src/client/`) registers into the `conversation.input.right` slot and the plugin-detail configuration card (`plugins.bundle.config`); the build emits the DSH `__ModuleLoader__` closure format with `react` and the official `@deepseek-ai/*` peer packages as externals (everything else comes from the browser module table). The card draws its own shell and `SettingsCardController` writes on every change, falling back to the Host value on refusal. Copy dictionaries live in `src/client/locales.ts` (`zh` authoritative, `en` key-parity) and register via `ctx.locale.register`.

## How it works

The plugin is an invisible composer slot entry that mounts a capture-phase `keydown` listener on the document. It takes over Up only when the caret is on the first line (Down only on the last line), the target is the composer editor, no modifiers are held, no IME composition is active, no suggestion menu is open, and the session is not busy — then writes the recalled text through `inputActions.setDraft`. The browse position is an "entries seen" counter (`browseRef.step`) plus a copy of the line typed before browsing began, mirroring Claude Code's `upOrHistoryUp` / `downOrHistoryDown` ("move the caret first"). The history list is fed from the snapshot's `user`/`steering` nodes (deduped by seq). Multi-line row numbers are computed from Lexical's `<br>` structure.

## License

[MIT](LICENSE)
