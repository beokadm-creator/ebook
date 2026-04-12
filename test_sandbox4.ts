const text = "홍길동 1, 2, 3";
const blockRegex = /([0-9]+(?:[\s,*-]+[0-9]+)*[\s*)]*)/g;
let replaced = text.replace(blockRegex, (match) => {
  return match.replace(/[0-9]/g, d => d).replace(/,/g, '<sup>,</sup>');
});
console.log(replaced);
