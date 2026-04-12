import { htmlToTextRuns, textRunsToHtml } from './src/lib/publishing/richText';

const html1 = "Hello<div><br></div>";
const runs1 = htmlToTextRuns(html1);
console.log("runs1:", JSON.stringify(runs1));
console.log("html1_back:", JSON.stringify(textRunsToHtml(runs1)));

const html2 = "Hello<br><br>";
const runs2 = htmlToTextRuns(html2);
console.log("runs2:", JSON.stringify(runs2));
console.log("html2_back:", JSON.stringify(textRunsToHtml(runs2)));

