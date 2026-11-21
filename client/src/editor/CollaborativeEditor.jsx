import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorToolbar } from './EditorToolbar';

export function CollaborativeEditor({
  ydoc,
  provider,
  user,
  readOnly = false,
  onOutlineChange,
  onSelectionChange,
  onEditorReady,
  onAskAISelection,
  selectedText,
}) {
  const editor = useEditor(
    {
      editable: !readOnly,
      extensions: [
        StarterKit.configure({
          // Yjs Collaboration extension manages CRDT-aware undo/redo history
          history: false,
        }),
        Underline,
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            rel: 'noopener noreferrer',
            target: '_blank',
          },
        }),
        Placeholder.configure({
          placeholder: 'Start writing, or ask Writing Assistant on the right to help draft or refine a section...',
        }),
        Collaboration.configure({
          document: ydoc,
          field: 'default',
        }),
        ...(provider
          ? [
              CollaborationCursor.configure({
                provider,
                user: {
                  name: user?.name || 'Collaborator',
                  color: user?.cursorColor || '#4F46E5',
                },
              }),
            ]
          : []),
      ],
      editorProps: {
        attributes: {
          class: 'focus:outline-none',
        },
      },
      onUpdate: ({ editor: ed }) => {
        extractHeadings(ed);
      },
      onSelectionUpdate: ({ editor: ed }) => {
        const { from, to } = ed.state.selection;
        if (from === to) {
          onSelectionChange?.('');
          return;
        }
        const text = ed.state.doc.textBetween(from, to, '\n\n').trim();
        onSelectionChange?.(text);
      },
    },
    [ydoc, provider, readOnly]
  );

  function extractHeadings(ed) {
    if (!ed || !onOutlineChange) return;
    const headings = [];
    let sectionIdx = 0;
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name === 'heading') {
        const text = node.textContent.trim();
        if (text) {
          const level = node.attrs.level || 1;
          if (level >= 2) sectionIdx += 1;
          headings.push({
            id: `h-${pos}`,
            pos,
            level,
            text,
            sectionIndex: level >= 2 ? sectionIdx : null,
          });
        }
      }
    });
    onOutlineChange(headings);
  }

  useEffect(() => {
    if (!editor) return undefined;
    editor.setEditable(!readOnly);
    onEditorReady?.(editor);
    extractHeadings(editor);

    const handleYUpdate = () => {
      // Allow ProseMirror to reconcile remote Yjs updates before refreshing outline
      requestAnimationFrame(() => extractHeadings(editor));
    };
    ydoc.on('update', handleYUpdate);
    return () => {
      ydoc.off('update', handleYUpdate);
    };
  }, [editor, readOnly, ydoc]);

  return (
    <div className="flex h-full flex-col">
      <EditorToolbar
        editor={editor}
        readOnly={readOnly}
        selectedText={selectedText}
        onAskAISelection={onAskAISelection}
      />

      <div className="flex-1 overflow-y-auto px-4 py-8 sm:px-10 lg:px-14">
        <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200/80 bg-white px-7 py-9 shadow-soft dark:border-slate-800 dark:bg-slate-900 sm:px-12 sm:py-11">
          {readOnly && (
            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              You have view-only access to this document. Ask the owner for Editor permissions to make changes.
            </div>
          )}
          <div className="syncspace-editor text-slate-800 dark:text-slate-100">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    </div>
  );
}
