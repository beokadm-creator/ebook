import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const normalizeAuthorTextToNodes = (text: string) => {
  const affiliationBlockRegex = /([0-9]+(?:[\s,*-]+[0-9]+)*[\s*)]*)/g;
  
  const parts = [];
  let lastIndex = 0;
  
  text.replace(affiliationBlockRegex, (match, p1, offset) => {
    if (offset > lastIndex) {
      parts.push(text.slice(lastIndex, offset));
    }
    
    parts.push(<sup key={offset}>{match}</sup>);
    
    lastIndex = offset + match.length;
    return match;
  });
  
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  
  return parts;
};

console.log(renderToStaticMarkup(<div>{normalizeAuthorTextToNodes("홍길동 1, 2, 3")}</div>));
