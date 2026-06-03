<!-- This section is maintained by the coding agent via lore (https://github.com/BYK/opencode-lore) -->
## Long-term Knowledge

### Pattern

<!-- lore:019e8c7b-23cd-71e6-9b29-e68443e0a323 -->
* **Ink toast placement and async compatibility**: Three-layer paste detection in Ink CLI apps. Layer 1: bracketed paste mode via \`process.stdin.prependListener\` (NOT Ink's \`useStdin().stdin\`) intercepting \`\x1b\[200~\`/\`\x1b\[201~\` markers. Layer 2: multi-char fallback for \`ch.length > 1\` in \`useInput\`. Layer 3: timing fallback for terminals where Ink splits paste into individual \`ch.length === 1\` events — characters inserted instantly, 200ms timer reset on each char, timer fires → check ≥5 lines OR ≥200 chars → replace input with badge. All non-character events (Enter, arrows, backspace, Escape) clear the timeline to prevent false triggers. \`setTimeout(0)\` delays \`isPastingRef\` reset so Ink ignores escape sequence bytes. Use \`useStdout().stdout.write()\` for escape sequences, not \`process.stdout\` directly. Badge UX: \`badgeLengthRef\` clamps cursor; Escape clears paste; Ctrl+P previews first 5 lines below prompt; Enter submits full original + extra text after badge; backspace at badge boundary clears entire paste; history blocked while paste active.
<!-- End lore-managed section -->
