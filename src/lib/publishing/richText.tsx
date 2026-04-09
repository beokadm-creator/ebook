import { TextMarkSet, TextRun } from '@/types/publishing';

const STRUCTURED_LABEL_PATTERN = /^(목적|방법|대상 및 방법|결과|결론|서론|증례보고|증례 보고|증례|고찰|Introduction|Background|Purpose|Methods?|Materials and Methods|Results?|Conclusion|Conclusions|Case|Case Report|Discussion)(\s*[:.\-]\s*|\s+|$)/i;

const renderStructuredText = (text: string) =>
  text.split('\n').map((line, lineIndex, lines) => {
    const match = line.match(STRUCTURED_LABEL_PATTERN);
    if (!match) {
      return (
        <span key={`line-${lineIndex}`}>
          {line}
          {lineIndex < lines.length - 1 ? '\n' : null}
        </span>
      );
    }

    const label = match[1];
    const separator = match[2] ?? '';
    const rest = line.slice(match[0].length);
    return (
      <span key={`line-${lineIndex}`}>
        <strong>{label}</strong>
        {separator}
        {rest}
        {lineIndex < lines.length - 1 ? '\n' : null}
      </span>
    );
  });

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const normalizeMarks = (marks?: TextMarkSet) => ({
  bold: Boolean(marks?.bold),
  italic: Boolean(marks?.italic),
  underline: Boolean(marks?.underline),
});

const marksEqual = (a?: TextMarkSet, b?: TextMarkSet) => {
  const left = normalizeMarks(a);
  const right = normalizeMarks(b);
  return left.bold === right.bold && left.italic === right.italic && left.underline === right.underline;
};

export const mergeAdjacentRuns = (runs: TextRun[]) => {
  const merged: TextRun[] = [];

  runs.forEach((run) => {
    if (!run.text) {
      return;
    }

    const previous = merged[merged.length - 1];
    if (previous && marksEqual(previous.marks, run.marks)) {
      previous.text += run.text;
      return;
    }

    merged.push({
      text: run.text,
      marks: run.marks && Object.values(run.marks).some(Boolean) ? normalizeMarks(run.marks) : undefined,
    });
  });

  return merged.length ? merged : [{ text: '' }];
};

export const textRunsToHtml = (runs: TextRun[]) =>
  runs
    .map((run) => {
      let content = escapeHtml(run.text).replace(/\n/g, '<br>');
      if (run.marks?.underline) {
        content = `<u>${content}</u>`;
      }
      if (run.marks?.italic) {
        content = `<em>${content}</em>`;
      }
      if (run.marks?.bold) {
        content = `<strong>${content}</strong>`;
      }
      return content;
    })
    .join('');

export const runsToMeasurementHtml = (runs: TextRun[]) =>
  runs
    .map((run) => {
      const styles: string[] = [];
      if (run.marks?.bold) styles.push('font-weight:700');
      if (run.marks?.italic) styles.push('font-style:italic');
      if (run.marks?.underline) styles.push('text-decoration:underline');
      const styleAttr = styles.length ? ` style="${styles.join(';')}"` : '';
      const content = escapeHtml(run.text).replace(/\n/g, '<br>');
      return styles.length ? `<span${styleAttr}>${content}</span>` : content;
    })
    .join('');

const extractRunsFromNode = (node: Node, inherited: TextMarkSet = {}): TextRun[] => {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ? [{ text: node.textContent, marks: inherited }] : [];
  }

  if (!(node instanceof HTMLElement)) {
    return [];
  }

  const marks = { ...inherited };
  const tag = node.tagName.toLowerCase();
  if (tag === 'strong' || tag === 'b') {
    marks.bold = true;
  }
  if (tag === 'em' || tag === 'i') {
    marks.italic = true;
  }
  if (tag === 'u') {
    marks.underline = true;
  }
  if (tag === 'br') {
    return [{ text: '\n', marks: inherited }];
  }

  const childRuns = Array.from(node.childNodes).flatMap((child) => extractRunsFromNode(child, marks));
  if (tag === 'div' || tag === 'p') {
    childRuns.push({ text: '\n', marks: inherited });
  }
  return childRuns;
};

export const htmlToTextRuns = (html: string) => {
  const container = document.createElement('div');
  container.innerHTML = html;
  const rawRuns = Array.from(container.childNodes).flatMap((node) => extractRunsFromNode(node));
  return mergeAdjacentRuns(rawRuns).map((run, index, list) => {
    if (index === list.length - 1) {
      return { ...run, text: run.text.replace(/\n+$/g, '') };
    }
    return run;
  });
};

export const renderRunsToReact = (runs: TextRun[]) =>
  runs.map((run, index) => {
    const style = {
      fontWeight: run.marks?.bold ? 700 : undefined,
      fontStyle: run.marks?.italic ? 'italic' : undefined,
      textDecoration: run.marks?.underline ? 'underline' : undefined,
      whiteSpace: 'pre-wrap' as const,
    };

    return (
      <span key={`run-${index}`} style={style}>
        {renderStructuredText(run.text)}
      </span>
    );
  });

export const splitRunsByTexts = (runs: TextRun[], segmentTexts: string[]) => {
  const segments: TextRun[][] = [];
  let runIndex = 0;
  let runOffset = 0;

  segmentTexts.forEach((segmentText) => {
    let remaining = segmentText.length;
    const segmentRuns: TextRun[] = [];

    while (remaining > 0 && runIndex < runs.length) {
      const currentRun = runs[runIndex];
      const available = currentRun.text.slice(runOffset);
      const take = Math.min(remaining, available.length);
      const textPart = available.slice(0, take);

      if (textPart) {
        segmentRuns.push({
          text: textPart,
          marks: currentRun.marks,
        });
      }

      remaining -= take;
      runOffset += take;

      if (runOffset >= currentRun.text.length) {
        runIndex += 1;
        runOffset = 0;
      }
    }

    segments.push(mergeAdjacentRuns(segmentRuns));
  });

  return segments;
};
