# dsh-prompt-history

[English](./README.md) | [中文](./README.zh.md)

[![npm](https://img.shields.io/npm/v/@wenaixi%2Fdsh-prompt-history?label=npm&color=CB3837)](https://www.npmjs.com/package/@wenaixi/dsh-prompt-history)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![DSH](https://img.shields.io/badge/DSH-Plugin-7c3aed)](https://github.com/deepseek-ai/deepseek-harness)
[![Node](https://img.shields.io/badge/node-%3E%3D20-5FA04E)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D11-F69220)](https://pnpm.io)

<p align="center">
  <img src="./assets/icon.png" alt="@wenaixi/dsh-prompt-history" width="128" height="128"><br/>
  <em>Terminal-style input for the DeepSeek Harness Web GUI composer: Claude Code-style prompt history, selection copy/quote, and right-click paste.</em>
</p>

DeepSeek Harness (DSH) Web GUI input composer enhancement plugin. Accurately recreates Claude Code's arrow-key prompt history recall and double-Escape workflows, provides selection toolbar quotation/auto-copy, right-click Linux-style direct paste, and unblocks inline slash completion under claimed command states. Pure client-side UI behavior with zero third-party dependencies, issuing zero model requests.

## Installation

Requires the DSH runtime (`npm i -g @deepseek-ai/dsh`). Node and pnpm floors are specified in the badges above. The examples below use the `web` profile; substitute your own profile name.

```bash
# A — npm channel (recommended, installs latest release)
dsh plugin --profile web add @wenaixi/dsh-prompt-history

# B — GitHub direct install (bypasses mirror latency)
dsh plugin --profile web add github:Wenaixi/dsh-prompt-history

# Verify configuration parsing
dsh --profile web --dump-config | grep -A2 "dsh-prompt-history"

# Launch session — refresh the page to use immediately
dsh --profile web
```

To pin a specific version, append `@<version>` or `#v<version>` to the package name (check `npm view @wenaixi/dsh-prompt-history version` for current releases).

Local development or offline tarball installation:

```bash
git clone https://github.com/Wenaixi/dsh-prompt-history && cd dsh-prompt-history
pnpm install && pnpm build && node --experimental-strip-types --test test/*.test.ts
dsh plugin --profile web add ./                           # Install from local directory
pnpm pack && dsh plugin --profile web add ./wenaixi-dsh-prompt-history-*.tgz

# Update / Uninstall
dsh plugin --profile web add @wenaixi/dsh-prompt-history
dsh plugin --profile web remove @wenaixi/dsh-prompt-history
```

## What It Is

A keyboard-first ergonomics suite tailored for the DSH browser composer.

During routine LLM-assisted development, manually retyping previous prompts, navigating across multi-line drafts, and repeatedly switching to the mouse for selection copying break the developer's train of thought. `@wenaixi/dsh-prompt-history` bridges mature terminal command-line muscle memory and Claude Code interaction patterns directly into the DSH browser workspace.

Client-side architectural boundaries:
- **Zero session event pollution**: emits no synthetic session events and leaves the agent execution loop intact;
- **Zero model requests**: pure UI behavior consuming zero model tokens;
- **Zero external network endpoints**: hosts no HTTP services; all configurations strictly adhere to the host `ConfigForm` contract;
- **Safe execution boundary**: recalled and quoted text only populates the local composer draft; content is never dispatched to the model until the user presses Enter.

## Core Features

### 1. Claude Code-Style Arrow-Key History Recall
- **Backward traversal on the first line (↑)**: when the caret is on the first line of the composer, pressing ↑ walks backward through historical prompts starting from the newest entry. The caret parks at the beginning of each recalled line; reaching the oldest entry stops without wrapping.
- **Forward traversal on the last line (↓)**: while in history browsing mode with the caret on the last line, pressing ↓ moves toward newer prompts, parking the caret at the line end. Traversing past the newest entry faithfully restores the original draft typed prior to browsing (restoring an empty line if started empty).
- **Edit exits browsing**: typing any character while browsing history immediately exits browsing mode, retaining the current draft.
- **Smart multi-line detection**: logic relies on Lexical's `<br>` block boundaries. Up/Down key takeovers only occur on the logical first or last lines, leaving intra-draft cursor navigation undisturbed.

### 2. Double-Escape Prompt History Picker
- **Fast overlay trigger**: with an empty composer draft, pressing Escape twice within 800 ms brings up the full prompt-history overlay (newest first, keeping only the latest occurrence of duplicates).
- **Real-time filtering & highlighting**: keyboard focus remains on the composer. Typing performs live substring and character subsequence fuzzy matching (`fuzzyMatch`, e.g., typing `dpl` matches `deploy now`), visually highlighting matched characters in the list.
- **Direct keyboard control**: ↑ and ↓ navigate the active highlight (clamped at boundaries without wrapping, never modifying the underlying draft), Home and End jump to edges, Enter or Tab populates the highlighted item, and Escape closes the overlay, restoring the prior draft.
- **Relative timestamps & wide-screen preview**: each row displays a relative age indicator (`5m / 3h / 2d`). On viewports ≥ 1000px wide, a right-hand pane provides an expanded multi-line preview of the highlighted item. The footer live-counts "matches / total".

### 3. Double-Escape Smart Draft Clearing
- With a non-empty composer draft, the first Escape displays a subtle hint ("Press Esc again to clear input") while passing the event through;
- Pressing Escape a second time within 800 ms saves the current draft into history and clears the composer (the cleared content remains recallable via ↑);
- Double-Escape can be toggled in settings; when disabled, Escape is handed entirely back to the host.

### 4. Text Selection Copy & Quotation
Any non-empty text selection across the page (composer, chat messages, code blocks) is handled per the selected mode:
- **Toolbar mode (default)**: floating "Copy" and "Quote" buttons appear above the selection. Clicking Copy writes to the system clipboard without flooding clipboard history; clicking Quote inserts the selected text into the composer as a markdown `>` blockquote.
- **Auto mode**: terminal-style; selecting text instantly writes it to the system clipboard.
- **Off mode**: disables intervention, preserving default browser selection behavior.

### 5. Right-Click Direct Paste
Right-clicking inside the composer instantly pastes the clipboard contents without opening a context menu, matching Linux terminal behavior. It executes through the exact same internal pipeline as Ctrl+V (preserving image attachments and chips identically), with a smooth fallback to the Clipboard API if `execCommand` is restricted.

### 6. Claimed Inline Slash Completion
When the host claims a parameterized command (e.g., `/plan `), it transitions the input guard to the `claimed` tier. In vanilla DSH, `detectTrigger` unconditionally ignores subsequent slashes, preventing autocomplete for commands like `/plan /dsh-plugin-dev`. This plugin wraps the trigger controller and dynamically downgrades the guard to `plain` when the caret rests on an inline slash preceded by text, allowing parameter completions to trigger as expected while strictly suppressing false positives like URLs and `//`.

### 7. Cross-Session History Persistence
By default, history is derived directly from the current conversation's message snapshot (`user` / `steering` nodes), maintaining natural session alignment across page reloads. Enabling the "Cross-session history" setting persists the history ring into browser `localStorage` up to the configured capacity limit, synchronizing entries across sessions and tabs.

## Keybindings Summary

| Shortcut / Gesture | Context | Behavior |
|---|---|---|
| `↑` | Composer first line | Recalls older prompt history (caret at line start; clamps at oldest) |
| `↓` | Composer last line (browsing) | Recalls newer prompt history (caret at line end; restores draft at bottom) |
| `Esc × 2` | Empty draft (within 800ms) | Opens the history picker overlay |
| `Esc × 2` | Non-empty draft (within 800ms) | First shows clear hint; second saves draft to history & clears input |
| `↑` / `↓` | Inside history picker | Moves active highlight (clamped at edges, no wrapping) |
| `Home` / `End` | Inside history picker | Jumps to the top / bottom of the history list |
| `Enter` / `Tab` | Inside history picker | Fills the highlighted entry into composer & closes overlay |
| `Esc` | Inside history picker | Closes overlay and restores previous composer draft |
| Right-click | Inside composer | Pastes clipboard text directly without opening context menu |
| Text selection | Any page content | Shows Copy/Quote toolbar (Toolbar mode) or copies directly (Auto mode) |

## Configuration Panel

Open **Plugin Manager -> @wenaixi/dsh-prompt-history -> Card Details** in the DSH Web interface to access the embedded settings panel.

The panel features a self-drawn shell implementing write-on-change semantics without a Save button. Any toggle or radio selection immediately commits atomically to the profile's `cordis.patch.yml` via host contracts:

| Setting | Key | Default | Description |
|---|---|---|---|
| Selection behavior | `copyMode` | `toolbar` | `toolbar` (floating buttons) / `auto` (copy on select) / `off` (disabled) |
| Arrow-key history | `historyEnabled` | `true` | Disabling hands ↑ and ↓ completely back to native host behavior |
| Double Escape | `doubleEsc` | `true` | Disabling hands Escape completely back to the host |
| Max history items | `maxHistoryItems` | `100` | Capacity cap for the history ring and picker (50 / 100 / 200 / 500 / 1000) |
| Relative timestamps | `relativeTime` | `true` | Displays relative timestamps on each row (e.g., 5m, 3h, 2d) |
| Fuzzy matching | `fuzzyMatch` | `true` | Enables character subsequence fuzzy filtering in history search |
| Cross-session memory | `globalHistory` | `false` | Retains history across sessions via browser `localStorage` |
| Right-click paste | `rightClickPaste` | `true` | Pastes clipboard directly on right-click; off restores context menu |
| Ignore leading space | `ignoreLeadingSpace` | `false` | Omits prompts with leading space from history (matches Bash ignorespace for privacy) |

Configuration data flow:
```
Card UI -> SettingsCardController -> ConfigForm.mutate
        -> Host SettingsController -> dsh-settings
        -> config-editor -> profile/cordis.patch.yml
```

## Directory Structure

```
src/
  index.ts                 # Host entrypoint; declares volatile configuration schema
  client/
    index.ts               # Client entrypoint; registers conversation.input.right & config slots
    claim-guard.ts         # Pure function hasInlineSlash: inline slash trigger rule
    history-model.ts       # Pure model: ring buffer, search, clamp, relative time formatting
    prefs-model.ts         # Pure model: preferences normalization, legacy migration, diffing
    prefs.ts               # Host config snapshot projection service for reactive UI updates
    card-controller.ts     # SettingsCardController: write-on-change mutation controller
    SettingsCard.tsx       # Settings panel component: custom shell, official Switch, radio cards
    InputHistory.tsx       # Core interaction: arrow recall, double-Esc picker, quote & paste
    editor.ts              # Composer DOM traversal, caret computation, Lexical line parsing
    nodes.ts               # Session snapshot message extraction
    feedback.ts            # Toast notifications for copy feedback and clear hints
    locales.ts             # Bilingual i18n dictionaries (zh / en)
locale/                    # Plugin metadata i18n files (zh.json / en.json)
test/                      # Pure functional unit test suite
cordis.patch.yml           # Default profile patch declaration
package.json               # Module manifest and platform contracts
```

## Development & Gates

Maintains strict engineering discipline with complete type checking, unit tests, and build verification gates:

```bash
# 1. Type checking
node node_modules/typescript/bin/tsc --noEmit

# 2. Pure functional unit tests
node --experimental-strip-types --test test/*.test.ts

# 3. Two-stage build: tsc declarations + tsdown bundle
pnpm build

# 4. Dry-run tarball integrity verification
npm pack --dry-run
```

The client bundle is emitted as a standard DSH `__ModuleLoader__` CJS factory closure, resolving dependencies entirely via host peer injections. Production artifacts weigh approximately 25 KB gzipped.

## FAQ

**Why does modifying settings fail with `settings/rejected` after an upgrade?**
This typically happens when a legacy profile's `cordis.patch.yml` contains retired keys from older versions (such as deprecated `tocVisible` or `historyGesture`). The host schema validator rejects mutations when unknown keys are present. Manually editing the profile's `cordis.patch.yml` to remove those deprecated lines resolves the issue.

**Why is there no Save button on the settings card?**
The plugin follows modern desktop and terminal tool design principles: settings take effect immediately upon change. Every toggle or selection change invokes `ConfigForm.mutate` against the host store, serialized and guarded by revision preconditions.

**Do shortcuts conflict when the slash command menu is open?**
No. The plugin includes an active menu avoidance guard (detecting `[role="listbox"]` and `[data-trigger-menu]`). When a suggestion dropdown is open, the plugin yields arrow key controls back to the host; when its own history picker is active, it takes precedence smoothly.

## Changelog

For detailed version history and release notes, see [CHANGELOG.md](./CHANGELOG.md).

## Contributing

Issues and Pull Requests are welcome. Before contributing, please review [CONTRIBUTING.md](./CONTRIBUTING.md).

## License & Credits

- Released under the [MIT License](./LICENSE).
- Interaction ergonomics inspired by [Anthropic Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code).
- Built on the runtime architecture of [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness).
- Architecture and plugin patterns guided by [dsh-plugin-dev](https://github.com/Wenaixi/dsh-plugin-dev).