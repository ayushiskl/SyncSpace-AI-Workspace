import * as Y from 'yjs';
import { diffChars, diffWordsWithSpace } from 'diff';

const FRAGMENT_NAME = 'default';

/**
 * Extract plain text from a Y.XmlElement or Y.XmlText recursively.
 */
export function getXmlNodeText(node) {
  if (!node) return '';
  if (node instanceof Y.XmlText) {
    return node.toString();
  }
  if (node instanceof Y.XmlElement || node instanceof Y.XmlFragment) {
    let out = '';
    const children = node.toArray();
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      if (child instanceof Y.XmlText) {
        out += child.toString();
      } else if (child instanceof Y.XmlElement) {
        const childText = getXmlNodeText(child);
        if (out.length > 0 && childText.length > 0 && !out.endsWith('\n')) {
          out += '\n';
        }
        out += childText;
      }
    }
    return out;
  }
  return '';
}

/**
 * Find the primary Y.XmlText inside a block element (e.g., paragraph, heading).
 */
export function getPrimaryXmlText(xmlElement) {
  if (!xmlElement) return null;
  if (xmlElement instanceof Y.XmlText) return xmlElement;
  const children = xmlElement.toArray();
  for (const child of children) {
    if (child instanceof Y.XmlText) return child;
    if (child instanceof Y.XmlElement) {
      const nested = getPrimaryXmlText(child);
      if (nested) return nested;
    }
  }
  return null;
}

/**
 * Populate a newly created Y.Doc with clean structured Tiptap content
 * so documents have immediate headings and sections ready for collaboration & AI.
 */
export function initializeDocumentContent(ydoc, title = 'Untitled Document', seedTemplate = true) {
  const fragment = ydoc.getXmlFragment(FRAGMENT_NAME);
  if (fragment.length > 0) return;

  ydoc.transact(() => {
    const appendBlock = (tag, text, attrs = {}) => {
      const el = new Y.XmlElement(tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      const xmlText = new Y.XmlText();
      if (text) xmlText.insert(0, text);
      el.insert(0, [xmlText]);
      fragment.insert(fragment.length, [el]);
    };

    if (!seedTemplate) {
      appendBlock('heading', title, { level: 1 });
      appendBlock('paragraph', '');
      return;
    }

    appendBlock('heading', title, { level: 1 });
    appendBlock(
      'paragraph',
      'Welcome to SyncSpace AI. Multiple collaborators and AI agents can edit this document simultaneously without losing concurrent human edits.'
    );
    appendBlock('heading', 'Section 1: Executive Overview', { level: 2 });
    appendBlock(
      'paragraph',
      'This workspace synchronizes every keystroke over CRDTs (Yjs), ensuring strong eventual consistency across all connected browsers.'
    );
    appendBlock('heading', 'Section 2: Architecture & Sync Protocol', { level: 2 });
    appendBlock(
      'paragraph',
      'Client editors bind ProseMirror state to a shared Y.XmlFragment. Incremental binary updates flow through authenticated WebSocket rooms and persist periodically to MongoDB snapshots.'
    );
    appendBlock('heading', 'Section 3: AI Collaboration Workflow', { level: 2 });
    appendBlock(
      'paragraph',
      'When a user asks the Writing Assistant to rewrite this section, the system captures a CRDT base state vector and relative anchors. If a teammate edits this paragraph while the AI is still thinking, our three-way merge engine preserves the human changes and flags any overlapping edits for review.'
    );
  }, 'system-init');
}

/**
 * Create a Y.Doc populated from custom blocks (useful for tests & imports).
 */
export function populateDocFromBlocks(ydoc, blocks) {
  const fragment = ydoc.getXmlFragment(FRAGMENT_NAME);
  ydoc.transact(() => {
    while (fragment.length > 0) {
      fragment.delete(0, 1);
    }
    for (const block of blocks) {
      const el = new Y.XmlElement(block.type || 'paragraph');
      if (block.attrs) {
        Object.entries(block.attrs).forEach(([k, v]) => el.setAttribute(k, v));
      }
      const xmlText = new Y.XmlText();
      if (block.text) xmlText.insert(0, block.text);
      el.insert(0, [xmlText]);
      fragment.insert(fragment.length, [el]);
    }
  }, 'system-populate');
}

/**
 * Extract flat list of top-level blocks in the Y.XmlFragment.
 */
export function extractBlocks(ydoc) {
  const fragment = ydoc.getXmlFragment(FRAGMENT_NAME);
  const items = fragment.toArray();
  return items.map((node, blockIndex) => {
    const nodeName = node instanceof Y.XmlElement ? node.nodeName : 'text';
    const attrs = node instanceof Y.XmlElement ? node.getAttributes() : {};
    const xmlText = getPrimaryXmlText(node);
    const text = getXmlNodeText(node);
    return {
      blockIndex,
      nodeName,
      attrs,
      text,
      xmlElement: node,
      xmlText,
    };
  });
}

/**
 * Extract full document plain text.
 */
export function getDocumentPlainText(ydoc) {
  const blocks = extractBlocks(ydoc);
  return blocks
    .map((b) => b.text.trim())
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Extract logical document sections grouped by headings (H2/H3, or H1 if no H2/H3 exist).
 */
export function extractSections(ydoc) {
  const blocks = extractBlocks(ydoc);
  const sections = [];

  // Determine whether document uses H2/H3 sections underneath an H1 title
  const hasSubHeadings = blocks.some(
    (b) => b.nodeName === 'heading' && Number(b.attrs?.level || 1) >= 2
  );

  let currentSection = null;
  let sectionCounter = 0;

  for (const block of blocks) {
    const isHeading = block.nodeName === 'heading';
    const level = Number(block.attrs?.level || 1);
    const startsNewSection = isHeading && (hasSubHeadings ? level >= 2 : level >= 1);

    if (startsNewSection) {
      if (currentSection) sections.push(currentSection);
      sectionCounter += 1;
      currentSection = {
        sectionIndex: sectionCounter,
        headingText: block.text.trim(),
        headingLevel: level,
        headingBlockIndex: block.blockIndex,
        bodyBlocks: [],
        allBlocks: [block],
      };
    } else if (currentSection) {
      currentSection.bodyBlocks.push(block);
      currentSection.allBlocks.push(block);
    } else {
      // Intro content before first section heading
      if (!sections.length && (!block.text.trim() && isHeading)) continue;
      if (!currentSection) {
        currentSection = {
          sectionIndex: 0,
          headingText: isHeading ? block.text.trim() : 'Introduction',
          headingLevel: isHeading ? level : 1,
          headingBlockIndex: isHeading ? block.blockIndex : null,
          bodyBlocks: isHeading ? [] : [block],
          allBlocks: [block],
        };
      }
    }
  }

  if (currentSection) sections.push(currentSection);

  return sections.map((sec) => {
    const contentBlocks = sec.bodyBlocks.length > 0 ? sec.bodyBlocks : sec.allBlocks;
    return {
      ...sec,
      blockIndices: contentBlocks.map((b) => b.blockIndex),
      text: contentBlocks.map((b) => b.text).join('\n\n'),
      fullText: sec.allBlocks.map((b) => b.text).join('\n\n'),
    };
  });
}

/**
 * Resolve which section/block(s) an AI instruction targets.
 */
export function resolveTargetSection(ydoc, options = {}) {
  const { instruction = '', selectedText = '', sectionIndex = null, blockIndex = null } = options;
  const blocks = extractBlocks(ydoc);
  const sections = extractSections(ydoc);

  // 1. Explicit selectedText match inside a specific block
  const cleanSelection = (selectedText || '').trim();
  if (cleanSelection.length > 0) {
    // Try single-block exact substring match first
    for (const block of blocks) {
      if (!block.xmlText) continue;
      const idx = block.text.indexOf(cleanSelection);
      if (idx !== -1) {
        return {
          type: 'selection',
          label: 'Selected text',
          headingText: null,
          sectionIndex: null,
          blockIndices: [block.blockIndex],
          blocks: [block],
          selectionSpan: {
            blockIndex: block.blockIndex,
            startOffset: idx,
            endOffset: idx + cleanSelection.length,
          },
          originalContent: cleanSelection,
        };
      }
    }

    // Multi-block selection fallback: find contiguous blocks matching lines
    const selLines = cleanSelection
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (selLines.length > 1) {
      const matched = [];
      for (const block of blocks) {
        if (selLines.some((line) => block.text.includes(line))) {
          matched.push(block);
        }
      }
      if (matched.length > 0) {
        return {
          type: 'selection-blocks',
          label: 'Selected paragraphs',
          headingText: null,
          sectionIndex: null,
          blockIndices: matched.map((b) => b.blockIndex),
          blocks: matched,
          selectionSpan: null,
          originalContent: matched.map((b) => b.text).join('\n\n'),
        };
      }
    }
  }

  // 2. Explicit sectionIndex
  if (sectionIndex !== null && sectionIndex !== undefined) {
    const num = Number(sectionIndex);
    const found =
      sections.find((s) => s.sectionIndex === num) ||
      sections.filter((s) => s.sectionIndex > 0)[num - 1];
    if (found) {
      const targetBlocks = found.bodyBlocks.length > 0 ? found.bodyBlocks : found.allBlocks;
      return {
        type: 'section',
        label: found.headingText || `Section ${num}`,
        headingText: found.headingText,
        sectionIndex: found.sectionIndex,
        blockIndices: targetBlocks.map((b) => b.blockIndex),
        blocks: targetBlocks,
        selectionSpan: null,
        originalContent: targetBlocks.map((b) => b.text).join('\n\n'),
      };
    }
  }

  // 3. Explicit blockIndex
  if (blockIndex !== null && blockIndex !== undefined) {
    const b = blocks[Number(blockIndex)];
    if (b) {
      return {
        type: 'block',
        label: `Paragraph ${b.blockIndex + 1}`,
        headingText: null,
        sectionIndex: null,
        blockIndices: [b.blockIndex],
        blocks: [b],
        selectionSpan: null,
        originalContent: b.text,
      };
    }
  }

  // 4. Parse natural-language section reference from instruction (e.g., "Rewrite section 3")
  const lower = instruction.toLowerCase();
  const sectionNumMatch =
    lower.match(/section\s+(\d+)/i) ||
    lower.match(/(?:^|\s)(\d+)(?:st|nd|rd|th)\s+section/i);
  if (sectionNumMatch) {
    const num = Number(sectionNumMatch[1]);
    const numberedSections = sections.filter((s) => s.sectionIndex > 0);
    const byHeadingTitle = sections.find((s) =>
      s.headingText.toLowerCase().includes(`section ${num}`)
    );
    const byOrder = numberedSections.find((s) => s.sectionIndex === num) || numberedSections[num - 1];
    const matchedSection = byHeadingTitle || byOrder;
    if (matchedSection) {
      const targetBlocks =
        matchedSection.bodyBlocks.length > 0 ? matchedSection.bodyBlocks : matchedSection.allBlocks;
      return {
        type: 'section',
        label: matchedSection.headingText || `Section ${num}`,
        headingText: matchedSection.headingText,
        sectionIndex: matchedSection.sectionIndex,
        blockIndices: targetBlocks.map((b) => b.blockIndex),
        blocks: targetBlocks,
        selectionSpan: null,
        originalContent: targetBlocks.map((b) => b.text).join('\n\n'),
      };
    }
  }

  // Match heading by title keyword
  for (const sec of sections) {
    if (sec.sectionIndex > 0 && sec.headingText.length >= 4) {
      const headingClean = sec.headingText.toLowerCase().replace(/^section\s*\d+\s*[:.-]?\s*/i, '');
      if (headingClean.length >= 4 && lower.includes(headingClean)) {
        const targetBlocks = sec.bodyBlocks.length > 0 ? sec.bodyBlocks : sec.allBlocks;
        return {
          type: 'section',
          label: sec.headingText,
          headingText: sec.headingText,
          sectionIndex: sec.sectionIndex,
          blockIndices: targetBlocks.map((b) => b.blockIndex),
          blocks: targetBlocks,
          selectionSpan: null,
          originalContent: targetBlocks.map((b) => b.text).join('\n\n'),
        };
      }
    }
  }

  // 5. Fallback: all non-empty body blocks (or full document)
  const contentBlocks = blocks.filter(
    (b, idx) => !(idx === 0 && b.nodeName === 'heading' && Number(b.attrs?.level) === 1) && b.text.trim().length > 0
  );
  const chosen = contentBlocks.length > 0 ? contentBlocks : blocks;

  return {
    type: 'document',
    label: 'Full Document',
    headingText: null,
    sectionIndex: null,
    blockIndices: chosen.map((b) => b.blockIndex),
    blocks: chosen,
    selectionSpan: null,
    originalContent: chosen.map((b) => b.text).join('\n\n'),
  };
}

/**
 * Capture Yjs CRDT RelativePosition anchors + Base State Vector for the targeted content.
 * RelativePositions survive concurrent insertions/deletions before, inside, or after the region!
 */
export function captureTargetAnchors(ydoc, target) {
  const fragment = ydoc.getXmlFragment(FRAGMENT_NAME);
  const baseStateVector = Buffer.from(Y.encodeStateVector(ydoc)).toString('base64');

  const blockAnchors = target.blocks.map((b) => {
    const startRel = b.xmlText
      ? Buffer.from(
          Y.encodeRelativePosition(
            Y.createRelativePositionFromTypeIndex(
              b.xmlText,
              target.selectionSpan ? target.selectionSpan.startOffset : 0
            )
          )
        ).toString('base64')
      : null;

    const endOffset = target.selectionSpan
      ? target.selectionSpan.endOffset
      : b.xmlText
        ? b.xmlText.length
        : 0;

    const endRel = b.xmlText
      ? Buffer.from(
          Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(b.xmlText, endOffset))
        ).toString('base64')
      : null;

    const blockRel = Buffer.from(
      Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(fragment, b.blockIndex))
    ).toString('base64');

    return {
      blockIndex: b.blockIndex,
      nodeName: b.nodeName,
      originalBlockText: target.selectionSpan ? target.originalContent : b.text,
      fullBlockTextAtCapture: b.text,
      isPartialSelection: Boolean(target.selectionSpan),
      startRel,
      endRel,
      blockRel,
    };
  });

  return {
    type: target.type,
    label: target.label,
    headingText: target.headingText,
    sectionIndex: target.sectionIndex,
    baseStateVector,
    blockAnchors,
  };
}

/**
 * Resolve captured Yjs RelativePosition anchors against the CURRENT live Y.Doc
 * to obtain the exact current text and live Y.XmlText references.
 */
export function resolveLiveAnchors(ydoc, anchorSnapshot) {
  const fragment = ydoc.getXmlFragment(FRAGMENT_NAME);
  const resolvedBlocks = [];

  for (const anchor of anchorSnapshot.blockAnchors || []) {
    let xmlText = null;
    let startIndex = 0;
    let endIndex = 0;
    let resolvedVia = 'relative-position';

    if (anchor.startRel && anchor.endRel) {
      try {
        const startAbs = Y.createAbsolutePositionFromRelativePosition(
          Y.decodeRelativePosition(Buffer.from(anchor.startRel, 'base64')),
          ydoc
        );
        const endAbs = Y.createAbsolutePositionFromRelativePosition(
          Y.decodeRelativePosition(Buffer.from(anchor.endRel, 'base64')),
          ydoc
        );

        if (startAbs && endAbs && startAbs.type instanceof Y.XmlText && startAbs.type === endAbs.type) {
          xmlText = startAbs.type;
          startIndex = Math.max(0, Math.min(startAbs.index, xmlText.length));
          endIndex = Math.max(startIndex, Math.min(endAbs.index, xmlText.length));
        }
      } catch {
        // Fallback below
      }
    }

    // Fallback via block relative position in fragment
    if (!xmlText && anchor.blockRel) {
      try {
        const blockAbs = Y.createAbsolutePositionFromRelativePosition(
          Y.decodeRelativePosition(Buffer.from(anchor.blockRel, 'base64')),
          ydoc
        );
        if (blockAbs && blockAbs.type === fragment && blockAbs.index < fragment.length) {
          const el = fragment.get(blockAbs.index);
          xmlText = getPrimaryXmlText(el);
          if (xmlText) {
            startIndex = 0;
            endIndex = xmlText.length;
            resolvedVia = 'block-relative-position';
          }
        }
      } catch {
        // Fallback below
      }
    }

    // Final index fallback
    if (!xmlText && anchor.blockIndex < fragment.length) {
      const el = fragment.get(anchor.blockIndex);
      xmlText = getPrimaryXmlText(el);
      if (xmlText) {
        startIndex = 0;
        endIndex = xmlText.length;
        resolvedVia = 'index-fallback';
      }
    }

    if (xmlText) {
      const fullCurrent = xmlText.toString();
      const currentSegment = anchor.isPartialSelection
        ? fullCurrent.slice(startIndex, endIndex)
        : fullCurrent;
      resolvedBlocks.push({
        anchor,
        xmlText,
        startIndex: anchor.isPartialSelection ? startIndex : 0,
        endIndex: anchor.isPartialSelection ? endIndex : fullCurrent.length,
        currentText: currentSegment,
        resolvedVia,
      });
    }
  }

  return {
    resolvedBlocks,
    currentContent: resolvedBlocks.map((r) => r.currentText).join('\n\n'),
  };
}

/**
 * Apply minimal CRDT operations (delete + insert) to a Y.XmlText inside a single transaction.
 * Preserves untouched characters, formatting marks, and remote collaborator cursors!
 */
export function applyMinimalDiffToXmlText(
  ydoc,
  xmlText,
  currentSlice,
  targetSlice,
  rangeOffset = 0,
  origin = 'ai-agent'
) {
  if (currentSlice === targetSlice) {
    return { changed: false, operations: 0 };
  }

  // Word-level diff keeps edits natural and minimal; falls back to char-level for small changes
  const useChars = currentSlice.length < 120 && targetSlice.length < 120;
  const parts = useChars
    ? diffChars(currentSlice, targetSlice)
    : diffWordsWithSpace(currentSlice, targetSlice);

  let operations = 0;

  ydoc.transact(() => {
    let cursor = rangeOffset;
    for (const part of parts) {
      if (part.removed) {
        if (part.value.length > 0) {
          xmlText.delete(cursor, part.value.length);
          operations += 1;
        }
      } else if (part.added) {
        if (part.value.length > 0) {
          xmlText.insert(cursor, part.value);
          cursor += part.value.length;
          operations += 1;
        }
      } else {
        cursor += part.value.length;
      }
    }
  }, origin);

  return { changed: operations > 0, operations };
}

/**
 * Commit target text into the live Y.Doc using captured relative-position anchors
 * and minimal surgical CRDT diffs.
 */
export function applyTextToAnchors(ydoc, anchorSnapshot, newContent, origin = 'ai-agent') {
  const { resolvedBlocks } = resolveLiveAnchors(ydoc, anchorSnapshot);
  if (resolvedBlocks.length === 0) {
    // If the original block was deleted entirely by a human, append cleanly at end
    const fragment = ydoc.getXmlFragment(FRAGMENT_NAME);
    ydoc.transact(() => {
      const el = new Y.XmlElement('paragraph');
      const txt = new Y.XmlText();
      txt.insert(0, newContent);
      el.insert(0, [txt]);
      fragment.insert(fragment.length, [el]);
    }, origin);
    return { appliedBlocks: 1, operations: 1, recreatedBlock: true };
  }

  // Single block / selection case (most common)
  if (resolvedBlocks.length === 1) {
    const rb = resolvedBlocks[0];
    const cleanNew = newContent.replace(/\r\n/g, '\n');

    // If AI produced multiple paragraphs for a full-block rewrite, keep first in existing node
    // and insert additional paragraph blocks right after it
    const paragraphs = rb.anchor.isPartialSelection
      ? [cleanNew.replace(/\n+/g, ' ')]
      : cleanNew
          .split(/\n{2,}/)
          .map((p) => p.trim())
          .filter(Boolean);

    const firstPara = paragraphs[0] ?? '';
    const res = applyMinimalDiffToXmlText(
      ydoc,
      rb.xmlText,
      rb.currentText,
      firstPara,
      rb.startIndex,
      origin
    );

    let extraOps = 0;
    if (paragraphs.length > 1 && !rb.anchor.isPartialSelection) {
      const fragment = ydoc.getXmlFragment(FRAGMENT_NAME);
      const blockEl = rb.xmlText.parent;
      const items = fragment.toArray();
      const idx = items.indexOf(blockEl);
      const insertAt = idx >= 0 ? idx + 1 : fragment.length;

      ydoc.transact(() => {
        const extraElements = paragraphs.slice(1).map((pText) => {
          const el = new Y.XmlElement('paragraph');
          const txt = new Y.XmlText();
          txt.insert(0, pText);
          el.insert(0, [txt]);
          return el;
        });
        fragment.insert(insertAt, extraElements);
        extraOps += extraElements.length;
      }, origin);
    }

    return {
      appliedBlocks: 1 + extraOps,
      operations: res.operations + extraOps,
      recreatedBlock: false,
    };
  }

  // Multi-block section case
  const targetParagraphs = newContent
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  let totalOps = 0;
  const count = Math.min(resolvedBlocks.length, targetParagraphs.length);

  for (let i = 0; i < count; i += 1) {
    const rb = resolvedBlocks[i];
    const textForBlock =
      i === count - 1 && targetParagraphs.length > resolvedBlocks.length
        ? targetParagraphs.slice(i).join(' ')
        : targetParagraphs[i];
    const res = applyMinimalDiffToXmlText(
      ydoc,
      rb.xmlText,
      rb.currentText,
      textForBlock,
      rb.startIndex,
      origin
    );
    totalOps += res.operations;
  }

  return {
    appliedBlocks: count,
    operations: totalOps,
    recreatedBlock: false,
  };
}
