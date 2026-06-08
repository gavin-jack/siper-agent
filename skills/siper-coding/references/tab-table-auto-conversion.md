# Tab-Separated Table Auto-Conversion (v0.9.44+, v0.9.76+ update)

## Problem

LLM outputs often use tab-separated pseudo-tables. renderMarkdown() only recognizes pipe-delimited tables.

## Solution (v0.9.76+)

Tab-to-pipe conversion now happens at the top of the while (i < lines.length) loop, before line is read. const line was changed to let line to support this.

Detection: line has tab, 2+ columns, adjacent line also has tab, not inside fenced code. Converts consecutive tab lines to pipe format in-place.

## Pitfall: ---### Mistaken for Unordered List

---### (HR+heading, no space) matches unordered list detection /^[-*+]\s*/ on the --- prefix.

Fix: Preprocessing splits ---### or --- ### into two lines before fenced code protection:
if (/^---+\s*#{1,6}\s*/.test(l.trim())) { split and push hrPart + rest separately }

## Agent.md Prevention

Specify standard MD table format in agent.md Response Format section to prevent tab-separated output at the source.
