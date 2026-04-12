import React, { useEffect, useRef } from 'react';
import { htmlToTextRuns, textRunsToHtml } from '@/lib/publishing/richText';
import { TextRun } from '@/types/publishing';

interface RichTextThreadEditorProps {
  runs: TextRun[];
  onChange: (runs: TextRun[]) => void;
}

const execFormat = (command: 'bold' | 'italic' | 'underline') => {
  document.execCommand(command);
};

const RichTextThreadEditor: React.FC<RichTextThreadEditorProps> = ({ runs, onChange }) => {
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }

    const nextHtml = textRunsToHtml(runs);
    const currentParsed = htmlToTextRuns(editorRef.current.innerHTML || '');
    
    // Only update innerHTML if the parsed text is actually different from incoming runs.
    // This prevents the cursor from jumping to the start while typing.
    const isSame = JSON.stringify(currentParsed) === JSON.stringify(runs);
    
    if (!isSame && editorRef.current.innerHTML !== nextHtml) {
      editorRef.current.innerHTML = nextHtml;
    }
  }, [runs]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex gap-1 border-b border-slate-200 p-2">
        <button
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            execFormat('bold');
            onChange(htmlToTextRuns(editorRef.current?.innerHTML || ''));
          }}
          className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100"
        >
          <span className="text-sm font-bold">B</span>
        </button>
        <button
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            execFormat('italic');
            onChange(htmlToTextRuns(editorRef.current?.innerHTML || ''));
          }}
          className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100"
        >
          <span className="text-sm italic">I</span>
        </button>
        <button
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            execFormat('underline');
            onChange(htmlToTextRuns(editorRef.current?.innerHTML || ''));
          }}
          className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100"
        >
          <span className="text-sm underline">U</span>
        </button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={() => onChange(htmlToTextRuns(editorRef.current?.innerHTML || ''))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            document.execCommand('insertLineBreak');
            onChange(htmlToTextRuns(editorRef.current?.innerHTML || ''));
          }
        }}
        className="min-h-[160px] whitespace-pre-wrap px-4 py-3 text-sm leading-7 text-slate-900 outline-none"
      />
    </div>
  );
};

export default RichTextThreadEditor;
