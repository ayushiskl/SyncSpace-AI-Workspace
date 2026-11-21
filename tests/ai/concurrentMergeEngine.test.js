import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { analyzeThreeWayMerge } from '../../server/src/ai/concurrentMergeEngine.js';
import {
  applyTextToAnchors,
  captureTargetAnchors,
  extractBlocks,
  populateDocFromBlocks,
  resolveLiveAnchors,
  resolveTargetSection,
} from '../../server/src/collaboration/yjsDocUtils.js';

describe('Three-Way Concurrent Human + AI Merge Engine', () => {
  it('performs clean apply when no concurrent human edits occurred', () => {
    const base = 'The system syncs edits over sockets and saves data.';
    const human = base;
    const ai = 'The system synchronizes edits over WebSockets and persists binary snapshots.';

    const result = analyzeThreeWayMerge(base, human, ai);

    expect(result.concurrentHumanEditsDetected).toBe(false);
    expect(result.hasConflict).toBe(false);
    expect(result.autoMergeable).toBe(true);
    expect(result.mergeStrategy).toBe('clean-apply');
    expect(result.safeMergedContent).toBe(ai);
  });

  it('safely merges disjoint concurrent human edits and AI rewrites without losing human text', () => {
    const base =
      'Our platform uses WebSockets for fast updates. The database stores snapshots periodically.';
    // Human appends a new detail at the end while AI is running
    const human =
      'Our platform uses WebSockets for fast updates. The database stores snapshots periodically. Target latency is under 50ms.';
    // AI rewrites only the first sentence from the older base
    const ai =
      'Our collaborative platform leverages Yjs over WebSockets for real-time updates. The database stores snapshots periodically.';

    const result = analyzeThreeWayMerge(base, human, ai);

    expect(result.concurrentHumanEditsDetected).toBe(true);
    expect(result.hasConflict).toBe(false);
    expect(result.autoMergeable).toBe(true);
    expect(result.mergeStrategy).toBe('three-way-safe-merge');
    expect(result.safeMergedContent).toContain('Target latency is under 50ms.');
    expect(result.safeMergedContent).toContain('Yjs over WebSockets');
  });

  it('detects overlapping concurrent human edits as Conflict and never silently overwrites human text', () => {
    const base = 'Section 3 explains how AI edits documents with basic replacement.';
    // Human modifies the exact phrase AI is also rewriting
    const human = 'Section 3 explains how AI edits documents with CRDT relative anchors and user approval.';
    // AI generated an older rewrite of the same span
    const ai = 'Section 3 describes automated AI document editing using structured diffs.';

    const result = analyzeThreeWayMerge(base, human, ai);

    expect(result.concurrentHumanEditsDetected).toBe(true);
    expect(result.hasConflict).toBe(true);
    expect(result.autoMergeable).toBe(false);
    expect(result.conflicts.length).toBeGreaterThan(0);
    // Safe merged content preserves the human's newer version on conflicting spans
    expect(result.safeMergedContent).toContain('CRDT relative anchors and user approval');
  });

  it('resolves Yjs RelativePosition anchors accurately even when humans insert new paragraphs above Section 3', () => {
    const ydoc = new Y.Doc();
    populateDocFromBlocks(ydoc, [
      { type: 'heading', attrs: { level: 1 }, text: 'Architecture Doc' },
      { type: 'heading', attrs: { level: 2 }, text: 'Section 1: Intro' },
      { type: 'paragraph', text: 'Intro text.' },
      { type: 'heading', attrs: { level: 2 }, text: 'Section 2: Sync' },
      { type: 'paragraph', text: 'Sync text.' },
      { type: 'heading', attrs: { level: 2 }, text: 'Section 3: AI Workflow' },
      { type: 'paragraph', text: 'Original section 3 paragraph.' },
    ]);

    const target = resolveTargetSection(ydoc, { instruction: 'Rewrite section 3' });
    expect(target.headingText).toBe('Section 3: AI Workflow');
    const anchors = captureTargetAnchors(ydoc, target);

    // Concurrently insert TWO brand new paragraphs in Section 1 (shifting all block indices!)
    const fragment = ydoc.getXmlFragment('default');
    ydoc.transact(() => {
      const p1 = new Y.XmlElement('paragraph');
      p1.insert(0, [new Y.XmlText('Inserted human paragraph A.')]);
      const p2 = new Y.XmlElement('paragraph');
      p2.insert(0, [new Y.XmlText('Inserted human paragraph B.')]);
      fragment.insert(3, [p1, p2]);
    }, 'human-user');

    // Resolve anchors -> MUST still point to Section 3's exact Y.XmlText despite index shift!
    const live = resolveLiveAnchors(ydoc, anchors);
    expect(live.currentContent).toBe('Original section 3 paragraph.');

    // Apply surgical diff to Section 3
    applyTextToAnchors(ydoc, anchors, 'Improved section 3 paragraph with CRDT safety.', 'ai-agent');

    const blocks = extractBlocks(ydoc);
    expect(blocks.some((b) => b.text === 'Inserted human paragraph A.')).toBe(true);
    expect(blocks.some((b) => b.text === 'Inserted human paragraph B.')).toBe(true);
    expect(blocks.some((b) => b.text === 'Improved section 3 paragraph with CRDT safety.')).toBe(true);
    ydoc.destroy();
  });
});
