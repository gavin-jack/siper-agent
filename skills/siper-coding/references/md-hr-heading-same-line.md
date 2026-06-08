# HR + Heading on Same Line (---### Pattern)

## Problem

LLM outputs `---### Heading` or `---###Heading` (horizontal rule + heading marker on same line, no newline between them). This is non-standard Markdown.

The unordered list detection `/^[-*+]\s*/` matches the `---` prefix, creating a spurious `<ul>` element. The heading is not recognized.

## Examples

```
忘语同名小说

---### 优点

和《长安十二时辰》对比
```

## Fix

In the preprocessing stage (before fenced code block protection), detect and split:

```javascript
// Split "---###" or "--- ###" into separate HR and heading lines
if (/^---+\s*#{1,6}\s*/.test(l.trim())) {
  const hrPart = l.trim().match(/^(---+)/)[1];
  const rest = l.trim().substring(hrPart.length).trim();
  expanded.push(hrPart);
  expanded.push(rest);
  continue;
}
```

This produces:
- Line 1: `---` (rendered as `<hr>`)
- Line 2: `### 优点` (rendered as `<h3>`)

## Placement

This check must run **before** the fenced code block protection in preprocessing, because `---` inside a fenced code block should NOT be split.

## Verification

After fix, `---### 优点` should render as HR + H3 heading, not as an unordered list.
