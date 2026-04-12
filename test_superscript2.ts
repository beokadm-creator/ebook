const SUPERSCRIPT_DIGIT_MAP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  ',': 'ʼ', '-': '⁻'
};

const newNormalize2 = (text: string) => {
  // Allow optional spaces after comma or hyphen inside the marker
  // Pattern: \d+(?:(?:,\s*|-\s*)\d+)*
  const NEW_PATTERN = /(\d+(?:(?:,\s*|-\s*)\d+)*)(\)?)/g;
  
  return text.replace(NEW_PATTERN, (_match, marker, paren) => {
    // Replace digits, commas, hyphens. We should also remove spaces inside the marker to make it compact?
    // Or replace spaces with... thin spaces? Let's just remove spaces.
    const compactMarker = marker.replace(/\s+/g, '');
    const convertedMarker = compactMarker.replace(/[\d,-]/g, (char: string) => SUPERSCRIPT_DIGIT_MAP[char] ?? char);
    const convertedParen = paren === ')' ? '⁾' : '';
    return `${convertedMarker}${convertedParen}`;
  });
};

console.log("\nNew Logic 2:");
console.log("홍길동1,2, 김철수3 ->", newNormalize2("홍길동1,2, 김철수3"));
console.log("홍길동 1, 2, 김철수 3 ->", newNormalize2("홍길동 1, 2, 김철수 3"));
console.log("홍길동1, 김철수2 ->", newNormalize2("홍길동1, 김철수2"));
console.log("홍길동 1, 김철수 2 ->", newNormalize2("홍길동 1, 김철수 2"));
