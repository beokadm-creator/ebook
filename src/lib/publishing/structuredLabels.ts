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

const SUPERSCRIPT_MAP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  ',': 'ʼ', // 위첨자 쉼표
  '-': '⁻', // 위첨자 하이픈
  '*': 'ˣ', // 위첨자 별표
  ')': '⁾'  // 위첨자 닫는 괄호
};

export const normalizeAuthorText = (text: string) => {
  const affiliationBlockRegex = /([0-9]+(?:[\s,*-]+[0-9]+)*[\s*)]*)/g;
  
  return text.replace(affiliationBlockRegex, (match) => {
    return match.replace(/[0-9,\-*\)]/g, (char) => SUPERSCRIPT_MAP[char] || char);
  });
};

