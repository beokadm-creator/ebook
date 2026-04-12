import { htmlToTextRuns } from './src/lib/publishing/richText';
import { JSDOM } from 'jsdom';

const dom = new JSDOM();
(global as any).document = dom.window.document;
(global as any).Node = dom.window.Node;
(global as any).HTMLElement = dom.window.HTMLElement;

const html1 = "Hello<br>World";
const html2 = "Hello<br><br>World";
const html3 = "Hello<br><br>";

console.log("1:", JSON.stringify(htmlToTextRuns(html1)));
console.log("2:", JSON.stringify(htmlToTextRuns(html2)));
console.log("3:", JSON.stringify(htmlToTextRuns(html3)));
