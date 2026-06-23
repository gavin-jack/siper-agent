/**
 * md-render.js - Markdown renderer (extracted from core.js renderMarkdown)
 *
 * Source: /home/gavin/.siper/webui/static/pages/core.js L2932-L4216
 * Merged: 2026-05-29
 * Zero external dependencies, pure vanilla JS.
 * Export: window.renderMarkdown
 */

'use strict';

// == esc + inline ==
function esc(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  // escapeHtml: alias for esc (used by mermaid code block rendering)
  function mdEscapeHtml(s) {
    return esc(s);
  }
  function inline(s) {
    s = esc(s);
    // Restore pipe placeholders from fenced code block protection
    s = s.replace(/\x00B/g, '|');
    // code span (process first to protect content)
    const codeSpans = [];
    s = s.replace(/`([^`]+)`/g, (_, c) => { codeSpans.push('<code class="md-code-inline">' + c + '</code>'); return '\x00C' + (codeSpans.length - 1) + '\x00'; });
    // bold + italic
    s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
    // links
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="md-link">$1</a>');
    // restore code spans
    s = s.replace(/\x00C(\d+)\x00/g, (_, i) => codeSpans[parseInt(i)] || '');
    return s;
  }


// == renderTreeDOM ==
function renderTreeDOM(treeLines) {
    // Split lines that contain multiple tree items (e.g. "│├── a│├── b")
    const expanded = [];
    treeLines.forEach(l => {
      const re = /(\u2502?\u251c|\u2502?\u2514)/g;
      const positions = [];
      let m;
      while ((m = re.exec(l)) !== null) positions.push(m.index);
      if (positions.length <= 1) { expanded.push(l); return; }
      for (let j = 0; j < positions.length; j++) {
        expanded.push(l.substring(positions[j], j + 1 < positions.length ? positions[j + 1] : l.length));
      }
    });
    // Parse each line into {depth, name}
    const parsed = expanded.map(l => {
      let depth = 0, pos = 0;
      while (pos < l.length) {
        const ch = l[pos];
        if (ch === '\u2502' || ch === '\u251c' || ch === '\u2514') {
          depth++; pos++;
          while (pos < l.length && (l[pos] === '\u2500' || l[pos] === ' ')) pos++;
        } else break;
      }
      return { depth, name: l.substring(pos).trim() };
    });
    // Build nested <ul>/<li> DOM
    const rootUl = document.createElement('ul');
    rootUl.className = 'md-tree';
    let currentUl = rootUl;
    let prevDepth = 0;
    let ulStack = [rootUl];
    parsed.forEach((item) => {
      const { depth, name } = item;
      if (depth > prevDepth) {
        const newUl = document.createElement('ul');
        newUl.className = 'md-tree';
        // Append to last <li> of current level
        const lastLi = currentUl.lastElementChild;
        if (lastLi) lastLi.appendChild(newUl);
        else currentUl.appendChild(newUl);
        currentUl = newUl;
        ulStack.push(currentUl);
      } else if (depth < prevDepth) {
        while (ulStack.length > depth + 1) {
          ulStack.pop();
          currentUl = ulStack[ulStack.length - 1];
        }
      }
      const li = document.createElement('li');
      li.className = 'md-tree-item';
      li.textContent = name;
      currentUl.appendChild(li);
      prevDepth = depth;
    });
    return rootUl;
  }

// == syntaxHighlight ==
function syntaxHighlight(code, lang) {
    let h = esc(code.replace(/\x00B/g, '|'));
    // Use placeholders to protect already-generated spans from being re-matched.
    // Strategy: collect all matches first, then replace in one pass using placeholders,
    // and finally substitute placeholders with real <span> tags.
    const spans = []; // [{start, end, className, text}]
    const addSpan = (start, end, cls, text) => {
      spans.push({start, end, cls, text});
    };
    // Sort spans by start position, no overlaps (comments > strings > keywords > numbers)
    // 1. Comments (highest priority - don't highlight inside comments)
    let commentRanges = [];
    if (lang === 'python' || lang === 'py' || lang === 'bash' || lang === 'sh' || lang === 'shell' || lang === 'zsh') {
      const re = /(#.*)$/gm; let m;
      while ((m = re.exec(h)) !== null) { commentRanges.push([m.index, m.index + m[0].length]); addSpan(m.index, m.index + m[0].length, 'md-cmt', m[0]); }
    } else if (lang === 'javascript' || lang === 'js' || lang === 'typescript' || lang === 'ts') {
      const re = /(\/\/\/.*$|\/\*[\s\S]*?\*\/)/gm; let m;
      while ((m = re.exec(h)) !== null) { commentRanges.push([m.index, m.index + m[0].length]); addSpan(m.index, m.index + m[0].length, 'md-cmt', m[0]); }
    } else if (lang === 'html' || lang === 'xml') {
      const re = /(&lt;!--[\s\S]*?--&gt;)/g; let m;
      while ((m = re.exec(h)) !== null) { commentRanges.push([m.index, m.index + m[0].length]); addSpan(m.index, m.index + m[0].length, 'md-cmt', m[0]); }
    }
    // Helper: check if position is inside any comment range
    const inComment = (pos) => commentRanges.some(([s, e]) => pos >= s && pos < e);
    // 2. Strings (skip if inside comment)
    const strRe = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g; let sm;
    while ((sm = strRe.exec(h)) !== null) { if (!inComment(sm.index)) addSpan(sm.index, sm.index + sm[0].length, 'md-str', sm[0]); }
    // Collect string ranges to skip keyword/number matching inside strings
    const stringRanges = spans.filter(s => s.cls === 'md-str').map(s => [s.start, s.end]);
    const inSpan = (pos, ranges) => ranges.some(([s, e]) => pos >= s && pos < e);
    // 3. Numbers (skip if inside comment or string)
    const numRe = /\b(\d+\.?\d*)\b/g; let nm;
    while ((nm = numRe.exec(h)) !== null) { if (!inComment(nm.index) && !inSpan(nm.index, stringRanges)) addSpan(nm.index, nm.index + nm[0].length, 'md-num', nm[0]); }
    // 4. Keywords (skip if inside comment or string)
    const kw = lang === 'python' || lang === 'py'
      ? /\b(def|class|import|from|return|if|elif|else|for|while|try|except|finally|with|as|yield|lambda|pass|break|continue|raise|and|or|not|in|is|None|True|False|self|async|await)\b/g
      : lang === 'javascript' || lang === 'js' || lang === 'typescript' || lang === 'ts'
      ? /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|default|async|await|try|catch|finally|throw|typeof|instanceof|in|of|null|undefined|true|false)\b/g
      : lang === 'bash' || lang === 'sh' || lang === 'shell' || lang === 'zsh'
      ? /\b(if|then|elif|else|fi|for|while|do|done|case|esac|function|return|exit|export|source|echo|cd|ls|grep|awk|sed|cat|mkdir|rm|cp|mv|chmod|sudo|apt|pip|npm)\b/g
      : lang === 'json'
      ? /\b(true|false|null)\b/g
      : null;
    if (kw) { let km; while ((km = kw.exec(h)) !== null) { if (!inComment(km.index) && !inSpan(km.index, stringRanges)) addSpan(km.index, km.index + km[0].length, 'md-kwd', km[0]); } }
    // Sort spans by start position
    spans.sort((a, b) => a.start - b.start);
    // Build result: walk through h, inserting <span> tags at span boundaries
    let result = '';
    let lastEnd = 0;
    for (const sp of spans) {
      if (sp.start < lastEnd) continue; // skip overlapping
      result += h.substring(lastEnd, sp.start);
      result += '<span class="' + sp.cls + '">' + sp.text + '</span>';
      lastEnd = sp.end;
    }
    result += h.substring(lastEnd);
    return result;
  };

// == preprocessMarkdown ==
function preprocessMarkdown(lines) {
  // Preprocess: split lines where multiple MD elements are jammed together
  // This handles LLM output that doesn't put elements on separate lines
  const codeBlocks = [];
  const processedLines = (() => {

    // === Phase 0: Extract fenced code blocks to protect them ===
    // LLM output often has ```langcontent... (no newline after lang) or
    // ```####heading (closing fence jammed against next heading).
    // Extract these code blocks first so the line-splitting below won't mangle them.
    const combinedText = lines.join('\n');
    let protectedText = combinedText;

    // Step 1: Extract single-line code blocks FIRST: ```langcontent...```
    // These are code blocks where opening fence, content, and closing fence are all on one line.
    // Must be extracted before multi-line blocks so the closing ``` doesn't get matched
    // by the multi-line regex as an opening fence.
    const singleLineRe = /```(\w+)(\S[^\n]*?)```/g;
    let slMatch;
    while ((slMatch = singleLineRe.exec(protectedText)) !== null) {
      const placeholder = '\x00CODEBLOCK' + codeBlocks.length + '\x00';
      codeBlocks.push(slMatch[0]);
      protectedText = protectedText.replace(slMatch[0], placeholder);
    }

    // Step 2: Extract multi-line code blocks: ```lang\n...content...```
    // Only matches when the opening fence is on its own line (or has only lang + spaces after it).
    protectedText = protectedText.replace(
      /```(\w*)\s*\n([\s\S]*?)```/g,
      function(m) {
        const placeholder = '\x00CODEBLOCK' + codeBlocks.length + '\x00';
        codeBlocks.push(m);
        return placeholder;
      }
    );

    // Step 3: Extract unclosed code blocks: ```langcontent... (no closing ```) to end of line
    // LLM output often omits the closing fence: ```css.code... or ```html<div>...
    const unclosedRe = /```(\w+)([^\n]+)(?=\n|$)/g;
    let ucMatch;
    while ((ucMatch = unclosedRe.exec(protectedText)) !== null) {
      const placeholder = '\x00CODEBLOCK' + codeBlocks.length + '\x00';
      codeBlocks.push(ucMatch[0]);
      protectedText = protectedText.replace(ucMatch[0], placeholder);
    }
    // Re-split into protected lines
    const protectedLines = protectedText.split('\n');
    // We'll process protected lines, then restore code blocks at the end
    const originalLines = lines;
    lines.length = 0;
    lines.push(...protectedLines);

    const expanded = [];
    let _preProcCount = 0;
    const _preProcMax = Math.max(lines.length * 5, 2000);
    for (let li = 0; li < lines.length; li++) {
      if (++_preProcCount > _preProcMax) {
        console.error('renderMarkdown: pre-processing safety stop at li=' + li + '/' + lines.length);
        expanded.push(lines.slice(li).join('\n'));
        break;
      }
      let l = lines[li];

      // === Smart unmarked list detection ===
      // LLM often outputs "filename(size) desc filename(size) desc" without any markers.
      // Detect consecutive "(size)" patterns and split into separate list items.
      if (l.length > 20 && !l.trim().startsWith('|') && !/^#{1,6}/.test(l.trim()) && !/^[-*+]/.test(l.trim())) {
        // Find all "(size)" occurrences — match (digits + optional unit)
        const sizePositions = [];
        let searchIdx = 0;
        while (searchIdx < l.length) {
          const parenIdx = l.indexOf('(', searchIdx);
          if (parenIdx < 0) break;
          // Check if this looks like a size: (digits optional-unit )
          const after = l.substring(parenIdx + 1, parenIdx + 15);
          if (/^\s*[\d.]+\s*[KMGT]?B\s*\)/.test(after)) {
            const closeIdx = l.indexOf(')', parenIdx);
            if (closeIdx > parenIdx) {
              sizePositions.push({ start: parenIdx, end: closeIdx + 1 });
              searchIdx = closeIdx + 1;
              continue;
            }
          }
          searchIdx = parenIdx + 1;
        }
        if (sizePositions.length >= 2) {
          // Sort by position and deduplicate
          sizePositions.sort((a, b) => a.start - b.start);
          const unique = [sizePositions[0]];
          for (let i = 1; i < sizePositions.length; i++) {
            if (sizePositions[i].start >= unique[unique.length - 1].end) {
              unique.push(sizePositions[i]);
            }
          }
          if (unique.length >= 2) {
            const coverage = unique[unique.length - 1].end - unique[0].start;
            if (coverage > l.length * 0.3) {
              // Split at each size marker boundary
              const parts = [];
              let lastEnd = 0;
              for (let si = 0; si < unique.length; si++) {
                let itemEnd = unique[si].end;
                if (si + 1 < unique.length) {
                  const between = l.substring(itemEnd, unique[si + 1].start);
                  // Find the first separator between items.
                  // LLM uses "—" (em dash) as description separator (keep in item)
                  // and "-" (hyphen) as item separator (split here).
                  // Split on "- " (hyphen+space) or "-~$-" or "-." (filename patterns)
                  let sepIdx = -1;
                  // Check for "- " (hyphen + space)
                  const hyphenSpaceIdx = between.indexOf('- ');
                  // Check for "-~$-" (hyphen before temp Office files)
                  const hyphenDollarIdx = between.indexOf('-$');
                  // Check for "-." (hyphen before file extension like -.docx)
                  const hyphenDotIdx = between.indexOf('-.');
                  // Check for "- " after CJK text (e.g. "快捷方式- ~$")
                  // General: hyphen followed by space, $, ., or uppercase
                  const hyphenGeneral = between.search(/(?<=\S)- (?=[~$A-Z\u4e00-\u9fff])/);
                  sepIdx = Math.min(
                    hyphenSpaceIdx >= 0 ? hyphenSpaceIdx : Infinity,
                    hyphenDollarIdx >= 0 ? hyphenDollarIdx : Infinity,
                    hyphenDotIdx >= 0 ? hyphenDotIdx : Infinity,
                    hyphenGeneral >= 0 ? hyphenGeneral : Infinity
                  );
                  if (sepIdx === Infinity) sepIdx = -1;
                  if (sepIdx >= 0) {
                    itemEnd = itemEnd + sepIdx; // split before the separator
                  }
                } else {
                  itemEnd = l.length;
                }
                const item = l.substring(lastEnd, itemEnd).trim();
                if (item) {
                  // If item already starts with "- " (was split at "- "), don't add another
                  parts.push(item.startsWith('- ') ? item : '- ' + item);
                }
                lastEnd = itemEnd;
              }
              if (parts.length >= 2) {
                // Convert "*filename" to "- filename" in each part
                const cleaned = parts.map(p => p.replace(/(^|(?<=[^a-zA-Z0-9*]))\*([\w\u4e00-\u9fff][\w\u4e00-\u9fff._\-~$]+)/g, '$1- $2'));
                expanded.push(...cleaned);
                continue;
              }
            }
          }
        }
      }

      // Skip very short lines and lines without MD markers
      // Also check for inline "- " (hyphen+space) which is a list marker in the middle of a line
      const hasInlineList = /(?<=\S)- /.test(l);
      if (l.length < 5 || (!l.includes('#') && !l.includes('|') && !/\d+\./.test(l) && !/^[-*+]/.test(l) && !hasInlineList)) {
        expanded.push(l);
        continue;
      }
      // Split inline heading+table anywhere in the line: "text##Title|col1|col2||..."
      // This handles LLM output where heading+table is jammed after preamble text
      // e.g. "我来查看一下...：##📋当前记忆内容|键名|内容概要||------|----------||..."
      // Find the first occurrence of ## followed by text and then |
      const inlineHtMatch = l.match(/^(.*?)((?:#{1,6})\s*[^#|]*?\|.*)$/);
      if (inlineHtMatch && inlineHtMatch[1].trim() && inlineHtMatch[2].match(/^#{1,6}\s*/)) {
        const preamble = inlineHtMatch[1].trim();
        const htPart = inlineHtMatch[2].trim();
        // Split heading from table: "##Title|col1|col2|" → "##Title" + "|col1|col2|"
        const htPipeIdx = htPart.indexOf('|');
        if (htPipeIdx > 0) {
          const hOnly = htPart.substring(0, htPipeIdx).trim();
          const tOnly = htPart.substring(htPipeIdx).trim();
          if (hOnly.match(/^#{1,6}\s*/) && tOnly.includes('|')) {
            if (preamble) expanded.push(preamble);
            expanded.push(hOnly);
            // tOnly may contain more heading+table patterns (e.g. "|---##Next|...|---**text**")
            // Insert it back into lines so the preprocess loop handles it recursively
            lines.splice(li + 1, 0, tOnly);
            continue;
          }
        }
      }
      // Split "---###" or "--- ###" into separate HR and heading lines
      // Handle both: line starts with "---###" and "---###" appears mid-line (after tabs)
      // The key insight: "---" must be preceded by "||" (end of table row) or be at line start
      // This prevents matching "------" inside table separator rows like "|------|----------|"
      // We use (?:.*\|\|) to require "||" before "---", or ^ for line-start case
      const hrHeadingMatch = l.trim().match(/^(.*\|\|)---+\s*(#{1,6}\s*.*)$/) || l.trim().match(/^(---+\s*)(#{1,6}\s*.*)$/);
      if (hrHeadingMatch) {
        const before = (hrHeadingMatch[1] || '').trim();
        const heading = hrHeadingMatch[2].trim();
        // Only split if heading part looks like a heading (starts with #)
        if (heading.match(/^#{1,6}\s*/)) {
          // Further split: heading may have table rows jammed after it
          // e.g. "---##Title| col1 | col2 |" → "---" + "##Title" + "| col1 | col2 |"
          const headingPipeIdx = heading.indexOf('|');
          let headingOnly = heading;
          let tableAfter = '';
          if (headingPipeIdx > 0) {
            const possibleHeading = heading.substring(0, headingPipeIdx).trim();
            const possibleTable = heading.substring(headingPipeIdx).trim();
            if (possibleHeading.match(/^#{1,6}\s*/) && possibleTable.includes('|')) {
              headingOnly = possibleHeading;
              tableAfter = possibleTable;
            }
          }
          if (before) {
            // Mid-line case: "text---### heading" → "text" + "---" + "### heading"
            // If before starts with # (heading jammed with table), split it further
            // e.g. "##Title|col1|col2||" → "##Title" + "|col1|col2||"
            if (before.match(/^#{1,6}\s*/)) {
              const beforeHt = before.match(/^(#{1,6}\s*[^#|]*?)(\|.*)$/);
              if (beforeHt) {
                const bh = beforeHt[1].trim();
                const bt = beforeHt[2].trim();
                if (bh.match(/^#{1,6}\s*/) && bt.includes('|')) {
                  expanded.push(bh);
                  expanded.push(bt);
                } else {
                  expanded.push(before);
                }
              } else {
                expanded.push(before);
              }
            } else {
              expanded.push(before);
            }
            // Extract the --- separator: must be || followed by --- followed by #
            // This avoids matching table separator rows like "||------|----------|"
            const sepMatch = l.trim().match(/\|\|(---+)(\s*#{1,6})/);
            if (sepMatch) expanded.push(sepMatch[1]);
            expanded.push(headingOnly);
          } else {
            // Line starts with "---### heading" → treat as heading only (no HR)
            // LLM output pattern: "---### Title" is just a heading with decorative ---
            expanded.push(headingOnly);
          }
          if (tableAfter) {
            // tableAfter may contain "---" jammed against more content
            // e.g. "|col1|col2||---**text**" → "|col1|col2||" + "---" + "**text**"
            // Use (?![-|]) to avoid matching table separator rows like "||------|"
            const taDashMatch = tableAfter.match(/^(.*\|\|)---+(?![-|])(.+)$/) || tableAfter.match(/^(.*\|)---+(?!-)(\*\*.*)$/);
            if (taDashMatch) {
              const taBefore = taDashMatch[1].trim();
              const taAfter = taDashMatch[2].trim();
              if (taBefore && taAfter && !taAfter.startsWith('|')) {
                expanded.push(taBefore);
                expanded.push('---');
                expanded.push(taAfter);
              } else {
                expanded.push(tableAfter);
              }
            } else {
              expanded.push(tableAfter);
            }
          }
          continue;
        }
      }
      // Split "---text" (HR marker jammed against non-heading text) into separate lines
      // e.g. "---共5个工具" → "---" + "共5个工具"
      // Only match when --- is followed by non-# text (if followed by #, handled by hrHeadingMatch above)
      const hrTextMatch = l.trim().match(/^(---+)\s*([^#].*)$/);
      if (hrTextMatch && !l.trim().match(/---+\s*#{1,6}/)) {
        expanded.push(hrTextMatch[1]);
        expanded.push(hrTextMatch[2].trim());
        continue;
      }
      // Split "\t###" (tab followed by heading) into separate lines
      // e.g. "演员类型\t###讲什么？" → "演员类型" + "###讲什么？"
      const tabHeadingMatch = l.match(/^(.*\S)\t+(#{1,6}\s*.*)$/);
      if (tabHeadingMatch) {
        const beforeTab = tabHeadingMatch[1].trim();
        const headingTab = tabHeadingMatch[2].trim();
        if (beforeTab && headingTab.match(/^#{1,6}\s*/)) {
          expanded.push(beforeTab);
          expanded.push(headingTab);
          continue;
        }
      }
      // Split "```" followed immediately by a heading: ```####text → ``` + ####text
      // This handles LLM output where the closing ``` of a code block is jammed
      // against the next heading without a newline, e.g. "ollama run llama3\n```#### 常用命令"
      // Only match ``` that is a closing fence (not followed by a lang identifier word)
      // Pattern: ``` then optional space then #heading (no word chars between ``` and #)
      const fenceHeadingMatch = l.trim().match(/^(.*?)```\s*(#{1,6}\s*.*)$/);
      if (fenceHeadingMatch) {
        const beforeFence = fenceHeadingMatch[1].trim();
        const afterFence = fenceHeadingMatch[2].trim();
        // Only split if afterFence looks like a heading AND beforeFence doesn't end with
        // a word char (which would mean ```lang#... is a lang identifier, not a closing fence)
        if (afterFence.match(/^#{1,6}\s*/) && !beforeFence.match(/\w$/)) {
          if (beforeFence) expanded.push(beforeFence);
          expanded.push('```');
          expanded.push(afterFence);
          continue;
        }
      }
      // Split "|" followed immediately by a heading: |text|####heading → |text| + ####heading
      // This handles LLM output where a table row's last cell is jammed against the next heading
      // e.g. "| **70B** |40GB+| 双卡| 不推荐纯CPU |#### 你的显卡能跑多大模型？"
      // Must NOT split on |#| where # is a table cell content (e.g. "|#| 文件 |问题 |")
      const tableHeadingMatch = l.trim().match(/^(.*\|)\s*(#{1,6}\s*.*)$/);
      if (tableHeadingMatch) {
        const beforePipe = tableHeadingMatch[1].trim();
        const afterHeading = tableHeadingMatch[2].trim();
        // Only split if: beforePipe ends with |, afterHeading starts with #,
        // AND the # is not preceded by a non-whitespace cell content character
        // (i.e. |#### is OK, but |text# is not — the # must be right after | with only whitespace)
        if (beforePipe.endsWith('|') && afterHeading.match(/^#{1,6}\s*/)) {
          // Additional check: the | before # must not have non-whitespace content between it and #
          // i.e. "|#### heading" is OK, "|#| cell |" is NOT OK (the # is a cell value, not a heading)
          // Heuristic: if afterHeading contains more | characters, the # was likely a table cell value
          if (afterHeading.includes('|')) {
            // afterHeading has pipes → the # is likely a table cell, not a heading
            // Don't split
          } else {
            expanded.push(beforePipe);
            expanded.push(afterHeading);
            continue;
          }
        }
      }
      // Split heading jammed with table: "##Title| col1 | col2 |" → "##Title" + "| col1 | col2 |"
      // This handles LLM output where a heading is immediately followed by a table row
      // e.g. "##📋当前记忆内容|键名|内容概要||------|----------||..."
      const headingTableMatch = l.trim().match(/^(#{1,6}\s*[^#|]*?)(\|.*)$/);
      if (headingTableMatch) {
        const headingOnly = headingTableMatch[1].trim();
        const tableAfter = headingTableMatch[2].trim();
        if (headingOnly.match(/^#{1,6}\s*/) && tableAfter.includes('|')) {
          expanded.push(headingOnly);
          expanded.push(tableAfter);
          continue;
        }
      }
      // Split line at "---" separator (horizontal rule jammed against content mid-line)
      // This handles LLM output like: "||cell|---##Next Section" or "||cell|---Some text"
      // Also handles: "|cell|---##Next Section" (single | before ---## heading)
      // Also handles: "|cell|---**Bold text**" (single | before --- bold text)
      // The (?![-|]) negative lookahead prevents matching "-----" (5+ dashes) and "---|" (table sep)
      // For ||--- pattern: afterDash must not start with - or | (avoids ||------| table sep)
      // For |---# and |---** patterns: only match when --- is followed by # or **
      const midLineDashMatch = l.trim().match(/^(.*\|\|)---+(?![-|])(.+)$/) || l.trim().match(/^(.*\|)---+(?!-)(#{1,6}.*)$/) || l.trim().match(/^(.*\|)---+(?!-)(\*\*.*)$/);
      if (midLineDashMatch) {
        const beforeDash = midLineDashMatch[1].trim();
        const afterDash = midLineDashMatch[2].trim();
        if (beforeDash && afterDash && !afterDash.startsWith('|')) {
          expanded.push(beforeDash);
          expanded.push('---');
          expanded.push(afterDash);
          continue;
        }
      }
      // Split heading jammed after heading: ###text####text → ###text + ####text
      // Also handles: ###text####textMoreText → ###text + ####textMoreText
      // This handles LLM output like: "###🧠 五、推荐模型选择####中文场景模型参数特点..."
      // Also handle "###1." → "### 1." (heading immediately followed by digit, no space)
      // Also handles "###4-6." → "### 4-6." (range in heading number)
      const headingNumMatch = l.trim().match(/^(#{1,6})(\d[\d\-]*\..*)$/);
      if (headingNumMatch) {
        expanded.push(headingNumMatch[1] + ' ' + headingNumMatch[2]);
        continue;
      }
      const headingJamMatch = l.trim().match(/^(#{1,6}\s*[^#\n].*?)(#{1,6}\s*\S.*)$/) ;
      if (headingJamMatch) {
        const firstHeading = headingJamMatch[1].trim();
        const secondPart = headingJamMatch[2].trim();
        // Don't split if secondPart starts with #| — it is a table cell (#| col1 | col2 |), not a heading
        // Instead, split the heading from the table part properly
        if (/^#+\|/.test(secondPart)) {
          // firstHeading is the real heading, secondPart is the table row
          // But firstHeading may end with | (e.g. "##Title|"), trim it
          const cleanHeading = firstHeading.replace(/\|+$/, '').trim();
          if (cleanHeading.match(/^#{1,6}\s*/)) {
            expanded.push(cleanHeading);
          }
          // secondPart starts with #|, restore to |#| for proper table rendering
          // Restore the # as cell content: #| col1 | col2 | → | # | col1 | col2 |
          const tableRow = secondPart.replace(/^#+\|/, '| # |');
          expanded.push(tableRow);
          continue;
        }
        // If firstHeading contains a code block placeholder, split it out
        // so the placeholder gets its own line and renders correctly
        const cbInHeading = firstHeading.match(/^(.*?)(\x00CODEBLOCK\d+\x00)(.*)$/);
        if (cbInHeading) {
          if (cbInHeading[1].trim()) expanded.push(cbInHeading[1].trim());
          expanded.push(cbInHeading[2]);
          if (cbInHeading[3].trim()) {
            const remainder = cbInHeading[3].trim();
            const remJam = remainder.match(/^(#{1,6}\s*[^#\n].*?)(#{1,6}\s*\S.*)$/);
            if (remJam) {
              expanded.push(remJam[1].trim());
              expanded.push(remJam[2].trim());
            } else {
              expanded.push(remainder);
            }
          }
          // Also push secondPart (the heading after the code block)
          expanded.push(secondPart);
          continue;
        }
        if (firstHeading.match(/^#{1,6}\s*/) || firstHeading.length >= 4) {
          expanded.push(firstHeading);
          // secondPart may still have heading+content jammed: e.g. "####中文场景模型参数特点"
          // Extract just the heading portion: # + 2-15 CJK chars or # + 2-10 word chars
          // Extract heading: # + up to 6 CJK chars or # + up to 8 word chars
          // Don't split if secondPart contains CJK parens "（）" or "()" — likely a complete heading
          let secondHeadingMatch = secondPart.match(/^(#{1,6}[\u4e00-\u9fff]{3,4})/);
          if (!secondHeadingMatch) secondHeadingMatch = secondPart.match(/^(#{1,6}[\w]{2,8})/);
          if (secondHeadingMatch) {
            // If the full secondPart contains parentheses, it's likely a complete heading
            if (/[（(]/.test(secondPart)) {
              expanded.push(secondPart);
            } else {
              expanded.push(secondHeadingMatch[1]);
              const rest = secondPart.substring(secondHeadingMatch[1].length).trim();
              if (rest) expanded.push(rest);
            }
          } else {
            expanded.push(secondPart);
          }
          continue;
        }
      }
      // Protect fenced code blocks from being mangled by inline code protection
      // and from having their | characters misinterpreted as table separators.
      // Replace | inside ```...``` with a placeholder before any other processing.
      l = l.replace(/```[\s\S]*?```/g, function(m) {
        return m.replace(/\|/g, '\x00B');
      });
      // Protect inline code spans from being split by list/heading regexes
      // Replace backtick code with placeholders before any splitting
      // Use \x00P prefix to avoid conflict with inline()'s \x00C placeholder
      const codeSpans = [];
      l = l.replace(/`([^`]+)`/g, (_, c) => { codeSpans.push(c); return '\x00P' + (codeSpans.length - 1) + '\x00'; });
      // Convert LLM-style "*filename" to "- filename" (asterisk used as bullet, not emphasis)
      // Match: "*" followed by filename-like pattern, where * is NOT preceded by a letter/digit
      // AND not preceded by another * (to avoid matching **bold** markers)
      // Use negative lookbehind for * to avoid matching the second * in **bold**
      l = l.replace(/(^|(?<=[^a-zA-Z0-9*]))\*(?!\*)([\w\u4e00-\u9fff][\w\u4e00-\u9fff._\-~$\s]*\()/g, '$1- $2');
      // Also convert standalone "*" before a filename-like word (no paren yet)
      // Same: must not be preceded by * (avoid **bold**)
      l = l.replace(/(^|(?<=[^a-zA-Z0-9*]))\*(?!\*)([\w\u4e00-\u9fff][\w\u4e00-\u9fff._\-~$]+)/g, '$1- $2');
      // Find all split points: positions where a new MD element starts
      const splits = [];
      // Skip all splitting for tree structure lines (box-drawing chars U+2500-U+257F)
      // These are file tree diagrams that should be rendered as-is
      if (/[\u2500-\u257F]/.test(l)) {
        expanded.push(l.replace(/\x00P(\d+)\x00/g, (_, i) => { const c = codeSpans[parseInt(i)] || ''; return '`' + c.replace(/\|/g, '\x00B') + '`'; }));
        continue;
      }
      // Heading boundaries: ## not preceded by #
      // Skip if line is a table row (starts with |)
      if (!l.trim().startsWith('|')) {
        let hMatch;
        const hRe = /(?:^|[^#])(#{1,6})\s*[^#]/g;
        while ((hMatch = hRe.exec(l)) !== null) {
          const pos = hMatch.index + (hMatch[0].startsWith('#') ? 0 : 1);
          // Skip if # is preceded by non-boundary chars (/, ., -, :, |)
          // This prevents splitting "dir/# comment", "file.json# comment", or "|#| table header"
          if (pos > 0) {
            const prevChar = l[pos - 1];
            if (/[\/.\-:：|]/.test(prevChar)) {
              if (hRe.lastIndex === hMatch.index) hRe.lastIndex++;
              continue;
            }
          }
          if (pos >= 0) splits.push(pos);
          if (hRe.lastIndex === hMatch.index) hRe.lastIndex++;
        }
      }
      // Ordered list boundaries: split "1.item12.item2" into "1.item1", "2.item2"
      // Only match list-like patterns: digit(s). followed by space+non-space, or
      // digit(s). followed by uppercase/CJK (not lowercase letters which are filenames)
      if (!l.trim().startsWith('|') && !/^#{1,6}/.test(l.trim())) {
        let olMatch;
        // "1. text" or "1.text" — only split when preceded by non-digit (not in middle of multi-digit numbers)
        // Do NOT split when preceded by * (bold/italic marker), e.g. "**3. text" should not split
        const olRe = /(?<=\D|^)(?=\d+\.\s\S)/g;
        while ((olMatch = olRe.exec(l)) !== null) {
          // Skip if preceded by * (bold/italic closing marker)
          if (olMatch.index > 0 && l[olMatch.index - 1] === '*') {
            // Must advance lastIndex to prevent infinite loop on zero-width match
            if (olRe.lastIndex === olMatch.index) olRe.lastIndex++;
            continue;
          }
          if (olMatch.index > 0) splits.push(olMatch.index);
          if (olRe.lastIndex === olMatch.index) olRe.lastIndex++;
        }
        // "1.Text" (no space) — only if preceded by start/space/punctuation AND followed by uppercase/CJK
        const olRe2 = /(?:^|(?<=[\s)]))(?=\d+\.[A-Z\u4e00-\u9fff\u3000-\u303f\uff00-\uffef])/g;
        let olMatch2;
        while ((olMatch2 = olRe2.exec(l)) !== null) {
          if (olMatch2.index > 0) splits.push(olMatch2.index);
          if (olRe2.lastIndex === olMatch2.index) olRe2.lastIndex++;
        }
      }
      // Unordered list boundaries: split "-item1-item2" into "-item1", "-item2"
      // Strategy: only split on "- " (hyphen+space) or "-text" at start of line.
      // Do NOT split on ")-", "a-", "0-" etc. (filenames, URLs, date ranges)
      // Do NOT split on em-dash "—" followed by "-"
      // Do NOT split date/version patterns like "2026-05"
      if (!l.trim().startsWith('|')) {
        let ulMatch;
        // Split on "- " (hyphen followed by space) — most common list marker
        const ulRe = /(?<=\S)(?=- )/g;
        while ((ulMatch = ulRe.exec(l)) !== null) {
          // Don't split if preceded by letter, digit, or CJK ideograph (e.g. "中文-中文", "word-word", "2026-05")
          // DO split if preceded by punctuation (e.g. "高潮：- item", "标题。- item", "；- item")
          // Also don't split em-dash/hyphen followed by "- " (e.g. "—- ")
          // EXCEPTION: CJK char followed by "- *" or "- **" is likely a list item (LLM output pattern)
          const prevChar = l[ulMatch.index - 1];
          if (prevChar && /[a-zA-Z0-9\u4e00-\u9fff\u3400-\u4dbf—–-]/.test(prevChar)) {
            // Allow split if CJK char + "- *" or "- **" (list item bold marker)
            const afterHyphen = l.substring(ulMatch.index + 2, ulMatch.index + 5);
            if (/^[\u4e00-\u9fff\u3400-\u4dbf]/.test(prevChar) && /^\*+/.test(afterHyphen)) {
              // CJK + "- *..." → likely list item, allow split
            } else {
              ulRe.lastIndex++;
              continue;
            }
          }
          if (ulMatch.index > 0) splits.push(ulMatch.index);
          if (ulRe.lastIndex === ulMatch.index) { ulRe.lastIndex++; }
          if (splits.length > 20) break;
        }
        // Also split "-text" at start of line (e.g. "-item1-item2" → "-item1", "-item2")
        // But only if the character after "-" is NOT a lowercase letter (avoid splitting filenames)
        // and NOT a digit (avoid splitting dates)
        if (/^-[^\s-]/.test(l.trim())) {
          // Lookbehind: any non-space char (word, punctuation, CJK, etc.)
          // Then filter out cases where the hyphen is inside a word (e.g. "openai-模式", "word-中文")
          // Heuristic: skip if lookbehind char is [a-z] AND the char before it is also [a-z] (word-internal hyphen)
          const ulRe2 = /(?<=[\w\uff1a\uff09\u3002\uff01\uff1b\uff1f:\u4e00-\u9fff\u3400-\u4dbf])(?=-[A-Z\u4e00-\u9fff\u3000-\u303f\uff00-\uffef*])/g;
          let ulMatch2;
          while ((ulMatch2 = ulRe2.exec(l)) !== null) {
            const pos = ulMatch2.index;
            // Skip decimal patterns like "2.0-Preview" (digit after dot is lookbehind char)
            if (pos >= 2 && l[pos - 2] === '.' && /\d/.test(l[pos - 1])) {
              ulRe2.lastIndex++;
              continue;
            }
            // Skip word-internal hyphens: "openai-模式", "word-中文" (lowercase letter preceded by lowercase letter)
            if (pos >= 1 && /[a-z]/.test(l[pos - 1]) && pos >= 2 && /[a-z]/.test(l[pos - 2])) {
              ulRe2.lastIndex++;
              continue;
            }
            if (pos > 0) splits.push(pos);
            if (ulRe2.lastIndex === ulMatch2.index) ulRe2.lastIndex++;
            if (splits.length > 20) break;
          }
        }
      }
      // Table row boundaries: | after non-| (for heading+table combos)
      // Only if line has both heading and |, and doesn't start with |
      if (!l.trim().startsWith('|') && l.includes('#') && l.includes('|')) {
        const firstPipe = l.indexOf('|');
        const lastHash = l.lastIndexOf('#');
        if (firstPipe > lastHash && firstPipe > 0) {
          splits.push(firstPipe);
        }
      }
      if (splits.length === 0) {
        // No split needed — restore code spans before pushing
        expanded.push(l.replace(/\x00P(\d+)\x00/g, (_, i) => { const c = codeSpans[parseInt(i)] || ''; return '`' + c.replace(/\|/g, '\x00B') + '`'; }));
        continue;
      }
      splits.sort((a, b) => a - b);
      // Deduplicate
      const unique = [splits[0]];
      for (let s = 1; s < splits.length; s++) {
        if (splits[s] - unique[unique.length - 1] > 1) unique.push(splits[s]);
      }
      // Split the line
      const parts = [];
      const beforeFirst = l.substring(0, unique[0]).trim();
      if (beforeFirst) parts.push(beforeFirst);
      for (let s = 0; s < unique.length; s++) {
        const start = unique[s];
        const end = s + 1 < unique.length ? unique[s + 1] : l.length;
        const part = l.substring(start, end).trim();
        if (part) parts.push(part);
      }
      if (parts.length > 1) {
        expanded.push(...parts.map(p => p.replace(/\x00P(\d+)\x00/g, (_, i) => { const c = codeSpans[parseInt(i)] || ''; return '`' + c.replace(/\|/g, '\x00B') + '`'; })));
      } else {
        // No split needed — restore code spans
        expanded.push(l.replace(/\x00P(\d+)\x00/g, (_, i) => { const c = codeSpans[parseInt(i)] || ''; return '`' + c.replace(/\|/g, '\x00B') + '`'; }));
      }
    }
    lines.length = 0;
    lines.push(...expanded);
    if (lines.length > 100) console.error('renderMarkdown: pre-proc produced', lines.length, 'lines from', combinedText.split('\n').length, 'original lines, text starts:', JSON.stringify(combinedText.substring(0,100)));
    // Note: code block placeholders (\x00CODEBLOCKn\x00) remain in lines.
    // They will be detected in the rendering loop and rendered directly.
    return lines;
  })();

  return { lines: processedLines, codeBlocks };
}

// == processBlocks ==
function processBlocks(text, lines, codeBlocks, frag, _maxIter) {
  let i = 0;
  let _iterCount = 0;
  const _maxIterCount = _maxIter || 5000;

  while (i < lines.length) {
  if (++_iterCount > _maxIter) {
    console.error('renderMarkdown: SAFETY STOP after', _maxIter, 'iterations, i=', i, 'lines=', lines.length, 'text:', JSON.stringify(text.substring(0, 200)));
    // Log all remaining lines for diagnosis
    for (let _di = i; _di < Math.min(i + 20, lines.length); _di++) {
      console.error('  line[' + _di + ']:', JSON.stringify(lines[_di]));
    }
    frag.appendChild(document.createTextNode('[渲染超时]'));
    return frag;
  }
  let line = lines[i];
  // Guard against undefined lines (should not happen, but defensive)
  if (typeof line === 'undefined') {
    console.error('renderMarkdown: undefined line at index', i, 'of', lines.length, 'for text starting with:', text.substring(0, 100));
    i++;
    continue;
  }

  // If this line is a code block placeholder, render it directly
  const cbMatchLine = line.match(/^\x00CODEBLOCK(\d+)\x00$/);
  if (cbMatchLine) {
    const idx = parseInt(cbMatchLine[1]);
    if (idx < codeBlocks.length) {
      const cb = codeBlocks[idx];
      // Try multi-line code block: ```lang[content]\n...code...```
      let cbMatch = cb.match(/```(\w*)([^\n]*)\n([\s\S]*?)```/);
      if (cbMatch) {
        const lang = cbMatch[1] || '';
        const firstLineExtra = cbMatch[2] || '';
        const codeContent = cbMatch[3];
        const allCodeLines = (firstLineExtra ? firstLineExtra + '\n' : '') + codeContent;
        // Special handling for mermaid diagrams
        if (lang === 'mermaid') {
          const mermaidDiv = document.createElement('div');
          mermaidDiv.className = 'mermaid-container';
          mermaidDiv.innerHTML = '<div class="mermaid">' + mdEscapeHtml(allCodeLines) + '</div>';
          frag.appendChild(mermaidDiv);
          continue;
        }
        const pre = document.createElement('pre');
        pre.className = 'md-code-block' + (lang ? ' md-lang-' + lang : '');
        const code = document.createElement('code');
        if (lang) code.className = 'language-' + lang;
        code.innerHTML = syntaxHighlight(allCodeLines, lang);
        const copyBtn = document.createElement('button');
        copyBtn.className = 'md-code-copy';
        copyBtn.textContent = '📋';
        copyBtn.title = '复制代码';
        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(allCodeLines).then(() => {
            copyBtn.textContent = '✓';
            setTimeout(() => copyBtn.textContent = '📋', 1500);
          });
        });
        if (lang) {
          const langTag = document.createElement('span');
          langTag.className = 'md-code-lang';
          langTag.textContent = lang;
          pre.appendChild(langTag);
        }
        pre.appendChild(copyBtn);
        pre.appendChild(code);
        frag.appendChild(pre);
      } else {
        // Try single-line code block: ```langcode...```
        cbMatch = cb.match(/```(\w+)(\S.*?)```/);
        if (cbMatch) {
          const lang = cbMatch[1] || '';
          const codeContent = cbMatch[2];
          const pre = document.createElement('pre');
          pre.className = 'md-code-block' + (lang ? ' md-lang-' + lang : '');
          const code = document.createElement('code');
          code.innerHTML = syntaxHighlight(codeContent, lang);
          const copyBtn = document.createElement('button');
          copyBtn.className = 'md-code-copy';
          copyBtn.textContent = '📋';
          copyBtn.title = '复制代码';
          copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(codeContent).then(() => {
              copyBtn.textContent = '✓';
              setTimeout(() => copyBtn.textContent = '📋', 1500);
            });
          });
          if (lang) {
            const langTag = document.createElement('span');
            langTag.className = 'md-code-lang';
            langTag.textContent = lang;
            pre.appendChild(langTag);
          }
          pre.appendChild(copyBtn);
          pre.appendChild(code);
          frag.appendChild(pre);
        }
      }
      // Try unclosed code block: ```langcontent (no closing ```)
      if (!cbMatch) {
        cbMatch = cb.match(/```(\w+)([^\n]+)/);
        if (cbMatch) {
          const lang = cbMatch[1] || '';
          const codeContent = cbMatch[2];
          const pre = document.createElement('pre');
          pre.className = 'md-code-block' + (lang ? ' md-lang-' + lang : '');
          const code = document.createElement('code');
          if (lang) code.className = 'language-' + lang;
          code.innerHTML = syntaxHighlight(codeContent, lang);
          const copyBtn = document.createElement('button');
          copyBtn.className = 'md-code-copy';
          copyBtn.textContent = '📋';
          copyBtn.title = '复制代码';
          copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(codeContent).then(() => {
              copyBtn.textContent = '✓';
              setTimeout(() => copyBtn.textContent = '📋', 1500);
            });
          });
          if (lang) {
            const langTag = document.createElement('span');
            langTag.className = 'md-code-lang';
            langTag.textContent = lang;
            pre.appendChild(langTag);
          }
          pre.appendChild(copyBtn);
          pre.appendChild(code);
          frag.appendChild(pre);
        }
      }
    }
    i++;
    continue;
  }

  // Tab-separated table detection: convert to pipe-separated before processing
  // Heuristic: line has tab, 2+ columns, all columns are short (<40 chars)
  // and at least one adjacent line also has tab (to avoid false positives)
  if (lines[i] && !lines[i].includes('|') && lines[i].includes('\t') && !lines[i].match(/^```/)) {
    const cols = lines[i].split('\t').filter(c => c.trim());
    if (cols.length >= 2 && cols.every(c => c.trim().length < 40)) {
      const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
      const prevLine = i > 0 ? lines[i - 1] : '';
      const nextHasTab = nextLine.includes('\t') && !nextLine.match(/^```/);
      const prevHasTab = prevLine.includes('\t') && !prevLine.match(/^```/);
      // Convert if: multi-column tab line with short values and tab context
      // Also convert single-row 2-column tab lines (key-value pairs) without context
      if (nextHasTab || prevHasTab || (cols.length === 2 && cols.every(c => c.trim().length < 30))) {
        let j = i;
        while (j < lines.length && lines[j].includes('\t') && !lines[j].match(/^```/)) {
          const parts = lines[j].split('\t').map(s => s.trim()).filter(Boolean);
          if (parts.length >= 2 && parts.every(p => p.length < 40)) {
            lines[j] = '| ' + parts.join(' | ') + ' |';
          }
          j++;
        }
        // Update line variable so the converted pipe format is processed below
        line = lines[i];
      }
    }
  }

  // Fenced code block ```lang ... ``` (multi-line) or ```code``` (single-line)
  const fenceMatch = line.match(/^```(\w*)\s*$/);
  // Also match LLM output: ```language//code (no space after lang, content on same line)
  // In this case, treat as single-line fenced code
  const fenceMatchInline = !fenceMatch && line.match(/^```(\w+)(\S.*)```\s*$/);
  // Also match LLM output: ```langcontent... (no space, no newline — content starts immediately after lang)
  // e.g. ```bash# comment or ```pythonimport foo
  // This is a multi-line code block where the first line starts with ```lang immediately followed by code
  const fenceMatchNoSpace = !fenceMatch && !fenceMatchInline && line.match(/^```(\w+)(\S.*)$/);
  // Also match LLM output: ```content... (no lang, no space — content starts immediately after ```)
  // e.g. ```some code text (no language identifier at all)
  const fenceMatchNoLang = !fenceMatch && !fenceMatchInline && !fenceMatchNoSpace && line.match(/^```(\S+)$/);
  if (fenceMatchNoLang) {
    const firstLine = fenceMatchNoLang[1];
    const codeLines = [firstLine];
    i++;
    while (i < lines.length && !lines[i].match(/^```\s*$/)) {
      codeLines.push(lines[i]);
      i++;
    }
    i++; // skip closing ```
    const pre = document.createElement('pre');
    pre.className = 'md-code-block';
    const code = document.createElement('code');
    code.innerHTML = syntaxHighlight(codeLines.join('\n'), '');
    const copyBtn = document.createElement('button');
    copyBtn.className = 'md-code-copy';
    copyBtn.textContent = '📋';
    copyBtn.title = '复制代码';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(codeLines.join('\n')).then(() => {
        copyBtn.textContent = '✓';
        setTimeout(() => copyBtn.textContent = '📋', 1500);
      });
    });
    pre.appendChild(copyBtn);
    pre.appendChild(code);
    frag.appendChild(pre);
    continue;
  }
  if (fenceMatchNoSpace) {
    const lang = fenceMatchNoSpace[1] || '';
    const firstLine = fenceMatchNoSpace[2]; // content after ```lang
    const codeLines = [firstLine];
    i++;
    while (i < lines.length && !lines[i].match(/^```\s*$/)) {
      codeLines.push(lines[i]);
      i++;
    }
    i++; // skip closing ```
    const pre = document.createElement('pre');
    pre.className = 'md-code-block' + (lang ? ' md-lang-' + lang : '');
    const code = document.createElement('code');
    code.innerHTML = syntaxHighlight(codeLines.join('\n'), lang);
    const copyBtn = document.createElement('button');
    copyBtn.className = 'md-code-copy';
    copyBtn.textContent = '📋';
    copyBtn.title = '复制代码';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(codeLines.join('\n')).then(() => {
        copyBtn.textContent = '✓';
        setTimeout(() => copyBtn.textContent = '📋', 1500);
      });
    });
    if (lang) {
      const langTag = document.createElement('span');
      langTag.className = 'md-code-lang';
      langTag.textContent = lang;
      pre.appendChild(langTag);
    }
    pre.appendChild(copyBtn);
    pre.appendChild(code);
    frag.appendChild(pre);
    continue;
  }
  if (fenceMatch) {
    const lang = fenceMatch[1] || '';
    const codeLines = [];
    i++;
    while (i < lines.length && !lines[i].match(/^```\s*$/)) {
      codeLines.push(lines[i]);
      i++;
    }
    i++; // skip closing ```
    const pre = document.createElement('pre');
    pre.className = 'md-code-block' + (lang ? ' md-lang-' + lang : '');
    const code = document.createElement('code');
    code.innerHTML = syntaxHighlight(codeLines.join('\n'), lang);
    const copyBtn = document.createElement('button');
    copyBtn.className = 'md-code-copy';
    copyBtn.textContent = '📋';
    copyBtn.title = '复制代码';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(codeLines.join('\n')).then(() => {
        copyBtn.textContent = '✓';
        setTimeout(() => copyBtn.textContent = '📋', 1500);
      });
    });
    if (lang) {
      const langTag = document.createElement('span');
      langTag.className = 'md-code-lang';
      langTag.textContent = lang;
      pre.appendChild(langTag);
    }
    pre.appendChild(copyBtn);
    pre.appendChild(code);
    frag.appendChild(pre);
    continue;
  }
  // Handle LLM-style single-line fenced code: ```language//code...```
  if (fenceMatchInline) {
    const lang = fenceMatchInline[1] || '';
    const codeContent = fenceMatchInline[2];
    const pre = document.createElement('pre');
    pre.className = 'md-code-block' + (lang ? ' md-lang-' + lang : '');
    const code = document.createElement('code');
    code.innerHTML = syntaxHighlight(codeContent, lang);
    const copyBtn = document.createElement('button');
    copyBtn.className = 'md-code-copy';
    copyBtn.textContent = '📋';
    copyBtn.title = '复制代码';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(codeContent).then(() => {
        copyBtn.textContent = '✓';
        setTimeout(() => copyBtn.textContent = '📋', 1500);
      });
    });
    if (lang) {
      const langTag = document.createElement('span');
      langTag.className = 'md-code-lang';
      langTag.textContent = lang;
      pre.appendChild(langTag);
    }
    pre.appendChild(copyBtn);
    pre.appendChild(code);
    frag.appendChild(pre);
    i++;
    continue;
  }

  // Single-line fenced code: ```code content here```
  const singleLineFence = line.match(/^```(\w*)\s*(.+?)```\s*$/);
  if (singleLineFence) {
    const lang = singleLineFence[1] || '';
    const codeContent = singleLineFence[2];
    const pre = document.createElement('pre');
    pre.className = 'md-code-block' + (lang ? ' md-lang-' + lang : '');
    const code = document.createElement('code');
    code.innerHTML = syntaxHighlight(codeContent, lang);
    const copyBtn = document.createElement('button');
    copyBtn.className = 'md-code-copy';
    copyBtn.textContent = '📋';
    copyBtn.title = '复制代码';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(codeContent).then(() => {
        copyBtn.textContent = '✓';
        setTimeout(() => copyBtn.textContent = '📋', 1500);
      });
    });
    if (lang) {
      const langTag = document.createElement('span');
      langTag.className = 'md-code-lang';
      langTag.textContent = lang;
      pre.appendChild(langTag);
    }
    pre.appendChild(copyBtn);
    pre.appendChild(code);
    frag.appendChild(pre);
    i++;
    continue;
  }

  // Table — detect |...| rows
  // Requirements: at least 2 real rows (header + data) or header + separator
  const _isSep = (s) => /^\s*\|?[\s\-:|]+\|?\s*$/.test(s) && s.includes('-');
  // Split a line into table-row segments: each segment is either a data row or separator
  // Handles LLM output where header and separator are on the same line: | h1 | h2 ||---|---| → 2 segments
  // Also handles: "text | h1 | h2 |---|---|" → text is separate, table segments extracted
  const _splitTableRowSegments = (line) => {
    const segments = [];
    // Split line by || first (row separator in LLM output), before normalizing pipes
    const subLines = line.trim().split('||');
    for (const sl of subLines) {
      const t = sl.trim();
      if (!t) continue;
      // Normalize pipes
      let s = t;
      if (!s.startsWith('|')) s = '| ' + s;
      if (!s.endsWith('|')) s = s + ' |';
      // Check if this sub-line is a separator row
      if (_isSep(s)) {
        segments.push('__sep__');
      } else {
        // Remove trailing separator-only cells (e.g. | h1 | h2 |---|---|)
        // Only filter cells that look like separator dashes (3+ consecutive -),
        // not single "-" which is valid data (e.g. "文件夹 | - | 5月22日")
        const cells = s.split('|').map(c => c.trim()).filter(Boolean);
        const realCells = cells.filter(c => !/^[\s:]*-{3,}[\s:]*$/.test(c));
        if (realCells.length > 0) {
          segments.push('| ' + realCells.join(' | ') + ' |');
        } else {
          segments.push('__sep__');
        }
      }
    }
    return segments;
  };
  // Inline heading split: "text### Title" → split into "text" + "### Title"
  // Must run before text-before-table and heading detection
  // Only split if the text before the heading does not end with '#'
  // (avoids splitting "####### Title" into "#" + "###### Title")
  // Also skip if the text before heading ends with /, ., -, : (path separators)
  // (avoids splitting "dir/# comment" or "file.json# anchor")
  // Also skip if the text before heading ends with backtick (inline code)
  // (avoids splitting "`code###text`" infinitely)
  const inlineH = line.match(/^(.*?)(\#{1,6}\s*.+)$/);
  if (inlineH && inlineH[1].trim() && inlineH[2].trim() && !/#$/.test(inlineH[1].trim())) {
    // Skip if the char before # is a path separator, table pipe, or backtick
    const beforeHash = inlineH[1].trim();
    if (beforeHash.length > 0 && /[\/\.\-：：\|`]/.test(beforeHash[beforeHash.length - 1])) {
      // Don't split — this is a path/URL with # anchor, table cell with #, or inline code with #
    } else {
      // Additional safety: if beforeHash itself contains #, splitting would cause infinite loop
      // because the before part would still match inlineH on next iteration
      if (/#/.test(beforeHash)) {
        // beforeHash contains # — splitting would produce a before part that still matches
        // Skip to prevent infinite loop
      } else {
        lines.splice(i, 1, inlineH[1].trim(), inlineH[2].trim());
        // Re-process current index (now the text before heading)
        i--;
        if (i < 0) i = 0;
        continue;
      }
    }
  }
  // Handle lines with text before table: "some text | col1 | col2 |"
  // Also handles heading + table on same line: "### Title | col1 | col2 |"
  // Extract the table part and insert it as a new line to process
  // Exclude: lines starting with | (pure table rows), and pure heading lines (no |)
  const _isPureHeading = /^#{1,6}\s*/.test(line.trim()) && !line.includes('|');
  if (line.includes('|') && !line.trim().startsWith('|') && !_isPureHeading) {
    const pipeIdx = line.indexOf('|');
    if (pipeIdx > 0) {
      const beforeText = line.substring(0, pipeIdx).trim();
      const tablePart = line.substring(pipeIdx).trim();
      // Validate: table part must have >= 3 pipes (at least 2 columns) or contain ||
      const pipeCount = (tablePart.match(/\|/g) || []).length;
      if (tablePart && (pipeCount >= 3 || tablePart.includes('||')) && _splitTableRowSegments(tablePart).length > 0) {
        // Render the text before the table (heading or paragraph)
        if (beforeText) {
          const _hMatch = beforeText.match(/^(#{1,6})\s*(.*)/);
          if (_hMatch) {
            const _lvl = _hMatch[1].length;
            const _txt = _hMatch[2].trim() || ' ';
            const _tag = 'h' + _lvl;
            const _hEl = document.createElement(_tag);
            _hEl.className = 'md-heading md-h' + _lvl;
            _hEl.innerHTML = inline(_txt);
            frag.appendChild(_hEl);
          } else {
            const p = document.createElement('p');
            p.className = 'md-paragraph';
            p.innerHTML = inline(beforeText);
            frag.appendChild(p);
          }
        }
        // Insert the table part to be processed next
        lines.splice(i + 1, 0, tablePart);
        i++;
        continue;
      }
    }
  }
  // Detect table row with trailing text粘连: "| cell1 | cell2 | trailing"
  // A proper table row ends with "|", so if it doesn't, split the trailing part
  if (line.trim().startsWith('|') && !line.trim().endsWith('|')) {
    const trimmed = line.trim();
    // Find the first pipe from right where text after it has no more pipes
    let trailPipe = -1;
    for (let p = trimmed.length - 1; p >= 0; p--) {
      if (trimmed[p] === '|' && !trimmed.substring(p + 1).includes('|')) {
        trailPipe = p;
        break;
      }
    }
    if (trailPipe > 0) {
      const trailingText = trimmed.substring(trailPipe + 1).trim();
      const tablePart = trimmed.substring(0, trailPipe + 1).trim();
      if (tablePart && trailingText) {
          lines.splice(i, 1, tablePart, trailingText);
          continue;
        }
      }
    }
  if (line.includes('|') && line.trim().startsWith('|') && !_isSep(line.trim())) {
    // Split into row segments (handles || as row separator)
    const subRows = _splitTableRowSegments(line.trim());
    // Count real data rows (non-separator)
    const dataRowCount = subRows.filter(r => r && r !== '__sep__').length;
    // Check context
    const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
    const prevLine = i > 0 ? lines[i - 1] : '';
    const nextIsTable = nextLine.includes('|') && nextLine.trim().startsWith('|');
    const prevIsTable = prevLine.includes('|') && prevLine.trim().startsWith('|');
    const nextIsSep = _isSep(nextLine.trim());
    // Accept: multi-row line, has adjacent table line, has separator after,
    // or single-row with 2+ columns (key-value table from tab conversion)
    const isMultiRow = dataRowCount >= 2;
    const hasContext = nextIsTable || prevIsTable || nextIsSep;
    const pipeCols = line.split('|').filter(s => s.trim());
    const isSingleRowTable = !isMultiRow && !hasContext && pipeCols.length >= 2 && _splitTableRowSegments(line.trim()).filter(r => r && r !== '__sep__' && !_isSep(r)).length === 1;
    if ((isMultiRow || hasContext || isSingleRowTable) && dataRowCount >= 1) {
      const table = document.createElement('table');
      table.className = 'md-table';
      // Collect all table rows from this line and adjacent table lines
      const tableRows = [];
      // Add non-separator sub-rows from current line
      subRows.forEach(r => {
        if (r && r !== '__sep__' && !_isSep(r)) tableRows.push(r);
      });
      // Look ahead for more table lines (skip separator lines but continue)
      let j = i + 1;
      while (j < lines.length) {
        let cl = lines[j];
        if (cl.includes('|') && cl.trim().startsWith('|')) {
          // Handle trailing text粘连: "| cell1 | cell2 | trailing" → split
          if (!cl.trim().endsWith('|')) {
            const trimmed = cl.trim();
            // Check if this looks like a table row with trailing text
            // by counting pipes: need at least 3 pipes (2 columns) before the trailing part
            const pipeCount = (trimmed.match(/\|/g) || []).length;
            if (pipeCount >= 3) {
              // Find the last pipe that has no more pipes after it
              let trailPipe = -1;
              for (let p = trimmed.length - 1; p >= 0; p--) {
                if (trimmed[p] === '|' && !trimmed.substring(p + 1).includes('|')) {
                  trailPipe = p;
                  break;
                }
              }
              if (trailPipe > 0) {
                const tablePart = trimmed.substring(0, trailPipe + 1).trim();
                const trailingText = trimmed.substring(trailPipe + 1).trim();
                // Replace current line with table part, insert trailing text after
                lines.splice(j, 1, tablePart, trailingText);
                cl = tablePart; // continue processing the table part
              } else {
                break;
              }
            } else {
              break;
            }
          }
          if (_isSep(cl)) { j++; continue; }
          // Use _splitTableRowSegments to handle || row separators properly
          const clSegs = _splitTableRowSegments(cl.trim());
          clSegs.forEach(s => {
            if (s && s !== '__sep__' && !_isSep(s)) tableRows.push(s);
          });
          j++;
        } else break;
      }
      if (tableRows.length >= 1) {
        const headers = tableRows[0].split('|').map(s => s.trim()).filter(Boolean);
        const thead = document.createElement('thead');
        const tr = document.createElement('tr');
        headers.forEach(h => {
          const th = document.createElement('th');
          th.innerHTML = inline(h);
          tr.appendChild(th);
        });
        thead.appendChild(tr);
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        for (let r = 1; r < tableRows.length; r++) {
          const rowCells = tableRows[r].split('|').map(s => s.trim()).filter(Boolean);
          const tr2 = document.createElement('tr');
          rowCells.forEach(c => {
            const td = document.createElement('td');
            td.innerHTML = inline(c);
            tr2.appendChild(td);
          });
          tbody.appendChild(tr2);
        }
        table.appendChild(tbody);
        frag.appendChild(table);
      }
      i = j;
      continue;
    }
  }

  // Headings — support "## Title", "##Title" (emoji/CJK), "###Title" etc.
  const hMatch = line.match(/^(#{1,6})\s*(.*)/);
  if (hMatch) {
    const lvl = hMatch[1].length;
    let headingText = hMatch[2].trim();
    // Skip empty headings (e.g. "###" alone) - render as hr instead
    if (!headingText) {
      const hr = document.createElement('hr');
      hr.className = 'md-hr';
      frag.appendChild(hr);
      i++;
      continue;
    }
    // If heading text contains a jammed heading (e.g. "## Title###SubTitle"),
    // split into separate headings
    const jammedHeading = headingText.match(/^(.*?)(#{1,6}\s*\S.*)$/);
    if (jammedHeading && jammedHeading[1].trim() && !jammedHeading[1].endsWith('#')) {
      // Render first heading
      const h1 = document.createElement('h' + lvl);
      h1.className = 'md-heading md-h' + lvl;
      h1.innerHTML = inline(jammedHeading[1].trim());
      frag.appendChild(h1);
      // Insert the second heading as a new line to process next
      lines.splice(i + 1, 0, jammedHeading[2].trim());
      i++;
      continue;
    }
    // If heading text contains a table row (e.g. "##Title | col1 | col2 |"),
    // split the table part out so it gets rendered as a table
    const pipeIdx = headingText.indexOf('|');
    if (pipeIdx > 0) {
      // Text before | is the real heading
      const realHeading = headingText.substring(0, pipeIdx).trim();
      const tablePart = headingText.substring(pipeIdx).trim();
      if (realHeading) {
        const h = document.createElement('h' + lvl);
        h.className = 'md-heading md-h' + lvl;
        h.innerHTML = inline(realHeading);
        frag.appendChild(h);
      }
      // Insert the table part as a new line to be processed next
      if (tablePart) {
        lines.splice(i + 1, 0, tablePart);
      }
      i++;
      continue;
    }
    const h = document.createElement('h' + lvl);
    h.className = 'md-heading md-h' + lvl;
    h.innerHTML = inline(headingText);
    frag.appendChild(h);
    i++;
    continue;
  }

  // Horizontal rule
  if (/^---+$|^\*\*\*+$|^___+$/.test(line.trim())) {
    const hr = document.createElement('hr');
    hr.className = 'md-hr';
    frag.appendChild(hr);
    i++;
    continue;
  }

  // Blockquote
  if (line.startsWith('>')) {
    const quoteLines = [];
    while (i < lines.length && lines[i].startsWith('>')) {
      quoteLines.push(lines[i].replace(/^>\s?/, ''));
      i++;
    }
    const bq = document.createElement('blockquote');
    bq.className = 'md-blockquote';
    bq.innerHTML = inline(quoteLines.join('\n')).replace(/\n/g, '<br>');
    frag.appendChild(bq);
    continue;
  }

  // Unordered list — support "- item", "* item", "+ item" (with or without space after marker)
  // Exclude "---" (horizontal rule) from being treated as a list item
  // Exclude "**bold**" starting with * (e.g. "**修炼体系**") — must not match **text**
  if (/^[-*+]\s*/.test(line.trim()) && !/^---+$/.test(line.trim()) && !/^\*\*/.test(line.trim())) {
    const ul = document.createElement('ul');
    ul.className = 'md-list';
    while (i < lines.length && /^[-*+]\s*/.test(lines[i].trim()) && !/^---+$/.test(lines[i].trim()) && !/^\*\*/.test(lines[i].trim())) {
      const li = document.createElement('li');
      const raw = lines[i].trim();
      const content = raw.replace(/^[-*+]\s*/, '');
      const inlined = inline(content);
      li.innerHTML = inlined;
      ul.appendChild(li);
      i++;
    }
    frag.appendChild(ul);
    continue;
  }

  // Ordered list — support "1. item" (with or without space after dot)
  if (/^\d+\.\s*/.test(line.trim())) {
    const ol = document.createElement('ol');
    ol.className = 'md-list md-ol';
    while (i < lines.length && /^\d+\.\s*/.test(lines[i].trim())) {
      const li = document.createElement('li');
      li.innerHTML = inline(lines[i].trim().replace(/^\d+\.\s*/, ''));
      ol.appendChild(li);
      i++;
    }
    frag.appendChild(ol);
    continue;
  }

  // Inline ordered list split: "text1. item2. item3. item" → split into separate lines
  // Handles cases like "建议尝试1.刷新页面-重新加载对话2.清除缓存3.切换设备"
  // where numbered items are concatenated without proper line breaks
  if (!/^\d+\./.test(line.trim())) {
    // Find all "N." patterns (N = 1+ digits, preceded by non-digit)
    // Filter out matches at position 0
    // Also filter out "N." followed by a digit (e.g. "2.0", "6.7" are decimals, not list items)
    const matches = [];
    const re = /(?<!\d)(\d+)\./g;
    let m;
    while ((m = re.exec(line)) !== null) {
      if (m.index > 0 && !/\d/.test(line[m.index + m[0].length] || '')) matches.push(m);
    }
    if (matches.length >= 2) {
      const parts = [];
      let prev = 0;
      for (const mm of matches) {
        if (mm.index > prev) {
          parts.push(line.substring(prev, mm.index).trim());
        }
        prev = mm.index;
      }
      parts.push(line.substring(prev).trim());
      const validParts = parts.filter(p => p);
      if (validParts.length >= 2) {
        lines.splice(i, 1, ...validParts);
        i--;
        if (i < 0) i = 0;
        continue;
      }
    }
  }

  // Empty line
  if (line.trim() === '') {
    i++;
    continue;
  }

  // Tree structure (box-drawing chars U+2500-U+257F) — render as nested list
  if (/[\u2500-\u257F]/.test(line)) {
    const treeLines = [line];
    i++;
    while (i < lines.length && /[\u2500-\u257F]/.test(lines[i])) {
      treeLines.push(lines[i]);
      i++;
    }
    // Parse and render tree
    frag.appendChild(renderTreeDOM(treeLines));
    continue;
  }

  // Paragraph — collect consecutive non-empty, non-special lines
  const paraLines = [line];
  i++;
  while (i < lines.length && lines[i].trim() !== ''
    && !lines[i].match(/^```/)
    && !lines[i].match(/^#{1,6}\s*/)
    && !lines[i].match(/^[-*+]\s*/)
    && !lines[i].match(/^\d+\.\s*/)
    && !lines[i].startsWith('>')
    && !lines[i].match(/^---+$|^\*\*\*+$|^___+$/)
    && !(lines[i].trim().startsWith('|'))
  ) {
    paraLines.push(lines[i]);
    i++;
  }
  const p = document.createElement('p');
  p.className = 'md-para';
  p.innerHTML = inline(paraLines.join('\n')).replace(/\n/g, '<br>');
  frag.appendChild(p);
  }
}


// == renderMarkdown (entry point) ==
function renderMarkdown(text) {
  if (!text) return document.createTextNode('');
  const frag = document.createDocumentFragment();
  const lines = text.split('\n');
  const _maxIter = 5000;

  // === Phase 1: Preprocess (code block extraction + line splitting) ===
  // Extracted to md-preprocess.js
  const preprocessed = preprocessMarkdown(lines);
  const processedLines = preprocessed.lines;
  const codeBlocks = preprocessed.codeBlocks;

  // === Phase 2: Block-level rendering ===
  processBlocks(text, processedLines, codeBlocks, frag, _maxIter);

  return frag;
}

// == Export ==
window.renderMarkdown = renderMarkdown;
