const STRUCTURED_LABEL_TERMS = [
  '문헌 고찰 및 결론',
  '문헌 고찰',
  '대상 및 방법',
  '환자 및 방법',
  '증례 보고',
  '증례보고',
  '배경',
  '서론',
  '목적',
  '방법',
  '결과',
  '결론',
  '증례',
  '고찰',
  'Literature Review and Conclusion',
  'Literature Review',
  'Materials and Methods',
  'Materials & Methods',
  'Material and Methods',
  'Patients and Methods',
  'Patients and methods',
  'Patients & Methods',
  'Patients & methods',
  'Case Presentation',
  'Case presentation',
  'Case Report',
  'Case report',
  'Backgrounds',
  'Background',
  'Introduction',
  'Purpose',
  'Methods',
  'Results',
  'Conclusion',
  'Conclusions',
  'Conclussion',
  'Discussion',
  'Cases',
  'Case',
  'Report',
  'report',
  '및 결론',
  '& Conclusion',
  '& Conclussion',
];

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const structuredLabelPartPattern = STRUCTURED_LABEL_TERMS
  .slice()
  .sort((left, right) => right.length - left.length)
  .map(escapeRegExp)
  .join('|');

const LABEL_PART_PATTERN = `(?:${structuredLabelPartPattern})`;
const STRUCTURED_LABEL_SEQUENCE_PATTERN = new RegExp(
  `^(${LABEL_PART_PATTERN}(?:(?:\\s*,\\s*|\\s*\\/\\s*|\\s*·\\s*)${LABEL_PART_PATTERN}){0,4})(\\s*[:.-]\\s*|\\s+|$)`,
  'i',
);

export interface StructuredLabelMatch {
  label: string;
  separator: string;
  rest: string;
}

export const getStructuredLabelMatch = (line: string): StructuredLabelMatch | null => {
  const trimmedStart = line.trimStart();
  const match = trimmedStart.match(STRUCTURED_LABEL_SEQUENCE_PATTERN);
  if (!match) {
    return null;
  }

  return {
    label: match[1],
    separator: match[2] ?? '',
    rest: trimmedStart.slice(match[0].length),
  };
};

export const startsWithStructuredLabel = (line: string) => Boolean(getStructuredLabelMatch(line));

export const normalizeStructuredBodyText = (text: string) =>
  text
    .split('\n')
    .map((line) => {
      const match = getStructuredLabelMatch(line);
      if (!match) {
        return line;
      }

      return line;
    })
    .join('\n');
