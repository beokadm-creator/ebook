const SUPERSCRIPT_DIGIT_MAP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  ',': '’',
  '-': '⁻'
};

const AUTHOR_MARKER_PATTERN = /(\d+(?:(?:,\s*|-\s*)\d+)*)(\)?)/g;
const SUPERSCRIPT_CLOSE_PAREN = '⁾';

const normalize = (text: string) => {
  return text.replace(AUTHOR_MARKER_PATTERN, (_match, marker: string, paren: string) => {
    const compactMarker = marker.replace(/\s+/g, '');
    const convertedMarker = compactMarker.replace(/[\d,-]/g, (char) => SUPERSCRIPT_DIGIT_MAP[char] ?? char);
    const convertedParen = paren === ')' ? SUPERSCRIPT_CLOSE_PAREN : '';
    return `${convertedMarker}${convertedParen}`;
  });
};

console.log(normalize("홍길동1,2*, 김철수3"));
console.log(normalize("홍길동1,2*,3, 김철수4"));
console.log(normalize("홍길동1,2,*, 김철수3"));
console.log(normalize("홍길동1, 2*, 김철수3"));
console.log(normalize("홍길동1,a, 김철수2"));
console.log(normalize("홍길동*, 김철수†"));
