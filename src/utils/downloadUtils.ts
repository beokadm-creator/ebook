import { ContentBlock as ContentType } from '../types/content';

export function downloadPublicationAsText(
  contentBlocks: ContentType[],
  title: string
): void {
  let textContent = `${title}\n`;
  textContent += '='.repeat(title.length) + '\n\n';

  contentBlocks.forEach((block) => {
    switch (block.type) {
      case 'heading': {
        const headingText = typeof block.content.text === 'string'
          ? block.content.text
          : block.content.text?.ko || '';
        const level = block.content.level || 1;
        textContent += `\n${'#'.repeat(level)} ${headingText}\n\n`;
        break;
      }

      case 'text': {
        const htmlVal = block.content.html;
        const rawText = typeof htmlVal === 'string' ? htmlVal : (htmlVal?.ko || '');
        const textContent_block = rawText.replace(/<[^>]*>/g, '');
        if (textContent_block) {
          textContent += `${textContent_block}\n\n`;
        }
        break;
      }

      case 'list': {
        if (block.content.items) {
          block.content.items.forEach((item: string | { ko: string; en?: string }, index: number) => {
            const itemText = typeof item === 'string' ? item : (item.ko || '');
            textContent += `${index + 1}. ${itemText}\n`;
          });
          textContent += '\n';
        }
        break;
      }

      case 'image': {
        if (block.content.caption) {
          const caption = typeof block.content.caption === 'string'
            ? block.content.caption
            : block.content.caption.ko || '';
          textContent += `[이미지: ${caption}]\n\n`;
        }
        break;
      }

      case 'footnote': {
        const footnoteText = typeof block.content.content === 'string'
          ? block.content.content
          : block.content.content?.ko || '';
        textContent += `[각주: ${footnoteText}]\n\n`;
        break;
      }

      default:
        break;
    }
  });

  const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title.replace(/[^a-z0-9가-힣]/gi, '_')}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadPublicationAsHTML(
  contentBlocks: ContentType[],
  title: string
): void {
  let htmlContent = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Pretendard', sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      color: #333;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 2em;
      margin-bottom: 1em;
    }
    p {
      margin-bottom: 1em;
    }
    img {
      max-width: 100%;
      height: auto;
    }
    .footnote {
      font-size: 0.9em;
      color: #666;
      border-left: 3px solid #ddd;
      padding-left: 1em;
      margin: 1em 0;
    }
    .callout {
      background-color: #f0f7ff;
      border-left: 4px solid #007bff;
      padding: 1em;
      margin: 1em 0;
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
`;

  contentBlocks.forEach((block) => {
    switch (block.type) {
      case 'heading': {
        const headingText = typeof block.content.text === 'string'
          ? block.content.text
          : block.content.text?.ko || '';
        const level = block.content.level || 1;
        htmlContent += `<h${level}>${headingText}</h${level}>\n`;
        break;
      }

      case 'text': {
        const htmlVal = block.content.html;
        const textContent_block = typeof htmlVal === 'string'
          ? htmlVal
          : htmlVal?.ko || '';
        if (textContent_block) {
          htmlContent += `<p>${textContent_block}</p>\n`;
        }
        break;
      }

      case 'list': {
        if (block.content.items) {
          htmlContent += '<ul>\n';
          block.content.items.forEach((item: string | { ko: string; en?: string }) => {
            const itemText = typeof item === 'string' ? item : (item.ko || '');
            htmlContent += `  <li>${itemText}</li>\n`;
          });
          htmlContent += '</ul>\n';
        }
        break;
      }

      case 'image': {
        if (block.content.url) {
          const caption = block.content.caption
            ? (typeof block.content.caption === 'string'
                ? block.content.caption
                : block.content.caption.ko || '')
            : '';
          htmlContent += `<figure>
            <img src="${block.content.url}" alt="${caption}" />
            ${caption ? `<figcaption>${caption}</figcaption>` : ''}
          </figure>\n`;
        }
        break;
      }

      case 'footnote': {
        const footnoteText = typeof block.content.content === 'string'
          ? block.content.content
          : block.content.content?.ko || '';
        htmlContent += `<div class="footnote">${footnoteText}</div>\n`;
        break;
      }

      default:
        break;
    }
  });

  htmlContent += `
</body>
</html>`;

  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title.replace(/[^a-z0-9가-힣]/gi, '_')}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}