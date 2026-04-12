import { TextRun } from './src/types/publishing';

export const parseAuthorTextToRuns = (text: string): TextRun[] => {
  const affiliationBlockRegex = /([0-9]+(?:[\s,*-]+[0-9]+)*[\s*)]*)/g;
  const runs: TextRun[] = [];
  let lastIndex = 0;

  text.replace(affiliationBlockRegex, (match, p1, offset) => {
    if (offset > lastIndex) {
      runs.push({ text: text.slice(lastIndex, offset) });
    }
    runs.push({ text: match, marks: { superscript: true } });
    lastIndex = offset + match.length;
    return match;
  });

  if (lastIndex < text.length) {
    runs.push({ text: text.slice(lastIndex) });
  }

  return runs.length ? runs : [{ text: '' }];
};

console.log(JSON.stringify(parseAuthorTextToRuns("홍길동 1, 2, 3"), null, 2));
