const SUPERSCRIPT_DIGIT_MAP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  ',': 'ʼ', '-': '⁻'
};

const normalize = (text: string) => {
  // Let's simulate the current logic
  const AUTHOR_MARKER_PATTERN = /(\d+(?:[,-]\d+)*)\)/g;
  const SUPERSCRIPT_CLOSE_PAREN = '⁾';
  
  return text
    .replace(AUTHOR_MARKER_PATTERN, (_match, marker: string) =>
      `${marker.replace(/[\d,-]/g, (char) => SUPERSCRIPT_DIGIT_MAP[char] ?? char)}${SUPERSCRIPT_CLOSE_PAREN}`,
    )
    .replace(/\d/g, (digit) => SUPERSCRIPT_DIGIT_MAP[digit] ?? digit);
};

console.log("Current Logic:");
console.log("홍길동1), 김철수2) ->", normalize("홍길동1), 김철수2)"));
console.log("홍길동1,2), 김철수3) ->", normalize("홍길동1,2), 김철수3)"));
console.log("홍길동1,2, 김철수3 ->", normalize("홍길동1,2, 김철수3")); // This fails the comma!
console.log("홍길동 1,2, 김철수 3 ->", normalize("홍길동 1,2, 김철수 3"));

const newNormalize = (text: string) => {
  // We want to match:
  // 1. Any sequence of digits, commas, and hyphens that are "together" without spaces, optionally ending with a parenthesis.
  // Wait, if we have "홍길동1,2, 김철수3", the comma after 2 is followed by a space.
  // The comma between 1 and 2 is NOT followed by a space.
  // So a superscript comma is a comma strictly between two digits: (\d),(\d)
  // Let's replace commas that are between digits!
  
  let result = text;
  
  // First, convert commas and hyphens that are strictly between digits
  // We can do this repeatedly or with a regex
  // Actually, any comma/hyphen that is flanked by digits or other already-converted superscripts.
  // Let's just match the whole block of affiliation numbers.
  // A block of numbers is: digits, optionally separated by commas/hyphens, optionally ending in ')'
  // But wait, "홍길동1,2, 김철수3" -> the block is "1,2". The comma after 2 is followed by space.
  // Pattern: \d+(?:[,-]\d+)*\)?
  const NEW_PATTERN = /(\d+(?:[,-]\d+)*)(\)?)/g;
  
  return result.replace(NEW_PATTERN, (_match, marker, paren) => {
    const convertedMarker = marker.replace(/[\d,-]/g, (char: string) => SUPERSCRIPT_DIGIT_MAP[char] ?? char);
    const convertedParen = paren === ')' ? '⁾' : '';
    return `${convertedMarker}${convertedParen}`;
  });
};

console.log("\nNew Logic:");
console.log("홍길동1), 김철수2) ->", newNormalize("홍길동1), 김철수2)"));
console.log("홍길동1,2), 김철수3) ->", newNormalize("홍길동1,2), 김철수3)"));
console.log("홍길동1,2, 김철수3 ->", newNormalize("홍길동1,2, 김철수3"));
console.log("홍길동1-3, 김철수4 ->", newNormalize("홍길동1-3, 김철수4"));
console.log("홍길동1,2*, 김철수3 ->", newNormalize("홍길동1,2*, 김철수3"));
