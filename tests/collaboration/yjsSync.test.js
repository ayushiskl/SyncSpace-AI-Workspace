import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import {
  getDocumentPlainText,
  populateDocFromBlocks,
} from '../../server/src/collaboration/yjsDocUtils.js';

describe('Yjs CRDT Concurrent Editing & Offline Reconnection Convergence', () => {
  it('converges two simultaneous editors editing different and overlapping positions', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    populateDocFromBlocks(docA, [
      { type: 'heading', attrs: { level: 1 }, text: 'Shared Spec' },
      { type: 'paragraph', text: 'Initial shared sentence.' },
    ]);

    // Sync initial state A -> B
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    expect(getDocumentPlainText(docB)).toBe(getDocumentPlainText(docA));

    const updatesA = [];
    const updatesB = [];
    docA.on('update', (u) => updatesA.push(u));
    docB.on('update', (u) => updatesB.push(u));

    // Concurrent edits while partitioned (offline/in-flight)
    const paraA = docA.getXmlFragment('default').get(1).get(0);
    const paraB = docB.getXmlFragment('default').get(1).get(0);

    docA.transact(() => {
      paraA.insert(0, '[Alice] ');
    });
    docB.transact(() => {
      paraB.insert(paraB.length, ' [Bob]');
    });

    // Reconnect and exchange buffered updates in opposite orders
    for (const u of updatesB) Y.applyUpdate(docA, u);
    for (const u of updatesA) Y.applyUpdate(docB, u);

    const finalA = getDocumentPlainText(docA);
    const finalB = getDocumentPlainText(docB);

    expect(finalA).toBe(finalB);
    expect(finalA).toContain('[Alice]');
    expect(finalA).toContain('[Bob]');
    expect(finalA).toContain('Initial shared sentence.');

    docA.destroy();
    docB.destroy();
  });

  it('recovers full CRDT state identically from persisted binary snapshot', () => {
    const liveDoc = new Y.Doc();
    populateDocFromBlocks(liveDoc, [
      { type: 'heading', attrs: { level: 1 }, text: 'Recovery Test' },
      { type: 'paragraph', text: 'Persisted paragraph survives restart.' },
    ]);

    const binarySnapshot = Buffer.from(Y.encodeStateAsUpdate(liveDoc));
    const expectedText = getDocumentPlainText(liveDoc);
    liveDoc.destroy();

    // Simulate server restart with brand new Y.Doc
    const recoveredDoc = new Y.Doc();
    Y.applyUpdate(recoveredDoc, new Uint8Array(binarySnapshot));

    expect(getDocumentPlainText(recoveredDoc)).toBe(expectedText);
    recoveredDoc.destroy();
  });
});
