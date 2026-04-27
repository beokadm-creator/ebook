import { TextMarkSet, TextRun } from '@/types/publishing';
import { getStructuredLabelMatch } from '@/lib/publishing/structuredLabels';

const renderStructuredText = (text: string) =>
  text.split('\n').map((line, lineIndex, lines) => {
    const match = getStructuredLabelMatch(line);
    if (!match) {
      return (
        <span key={`line-${lineIndex}`}>
          {line}
          {lineIndex < lines.length - 1 ? <br /> : null}
        </span>
      );
    }

    return (
      <span key={`line-${lineIndex}`}>
        <strong>{match.label}</strong>
        {match.separator}
        {match.rest}
        {lineIndex < lines.length - 1 ? <br /> : null}
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
  superscript: Boolean(marks?.superscript),
});

const marksEqual = (a?: TextMarkSet, b?: TextMarkSet) => {
  const left = normalizeMarks(a);
  const right = normalizeMarks(b);
  return left.bold === right.bold && left.italic === right.italic && left.underline === right.underline && left.superscript === right.superscript;
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
      if (run.marks?.superscript) {
        content = `<sup>${content}</sup>`;
      }
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
  if (tag === 'sup') {
    marks.superscript = true;
  }
  const fontWeight = node.style.fontWeight;
  if (fontWeight) {
    const numericWeight = Number.parseInt(fontWeight, 10);
    if (fontWeight === 'bold' || (Number.isFinite(numericWeight) && numericWeight >= 600)) {
      marks.bold = true;
    }
  }
  const fontStyle = node.style.fontStyle;
  if (fontStyle === 'italic' || fontStyle === 'oblique') {
    marks.italic = true;
  }
  const textDecoration = node.style.textDecoration || node.style.textDecorationLine;
  if (textDecoration && textDecoration.includes('underline')) {
    marks.underline = true;
  }
  if (node.style.verticalAlign === 'super') {
    marks.superscript = true;
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
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const rawRuns = Array.from(doc.body.childNodes).flatMap((node) => extractRunsFromNode(node));
  return mergeAdjacentRuns(rawRuns);
};

export const renderRunsToReact = (runs: TextRun[]) =>
  runs.map((run, index) => {
    const style = {
      fontWeight: run.marks?.bold ? 700 : undefined,
      fontStyle: run.marks?.italic ? 'italic' : undefined,
      textDecoration: run.marks?.underline ? 'underline' : undefined,
      whiteSpace: 'pre-wrap' as const,
    };

    if (run.marks?.superscript) {
      return (
        <sup key={`run-${index}`} style={style}>
          {renderStructuredText(run.text)}
        </sup>
      );
    }

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

  segmentTexts.forEach((segmentText, index) => {
    let remaining = segmentText.length;
    const segmentRuns: TextRun[] = [];
    const isLastSegment = index === segmentTexts.length - 1;

    while ((remaining > 0 || isLastSegment) && runIndex < runs.length) {
      const currentRun = runs[runIndex];
      const available = currentRun.text.slice(runOffset);
      const take = isLastSegment ? available.length : Math.min(remaining, available.length);
      const textPart = available.slice(0, take);

      if (textPart) {
        segmentRuns.push({
          text: textPart,
          marks: currentRun.marks,
        });
      }

      if (!isLastSegment) {
        remaining -= take;
      }
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
