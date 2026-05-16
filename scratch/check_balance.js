
import fs from 'fs';
const content = fs.readFileSync('app.js', 'utf8');

let bracesStack = [];
let parensStack = [];
let bracketsStack = [];
let inString = null;

const lines = content.split('\n');
for (let lineNum = 0; lineNum < lines.length; lineNum++) {
  const line = lines[lineNum];
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (inString) {
      if (char === inString && (i === 0 || line[i-1] !== '\\')) inString = null;
      continue;
    }
    
    if (char === "'" || char === '"' || char === '`') {
      inString = char;
      continue;
    }

    if (char === '{') bracesStack.push({ line: lineNum + 1, char: i + 1 });
    if (char === '}') {
      if (bracesStack.length === 0) console.log(`Extra } at line ${lineNum + 1}:${i + 1}`);
      else bracesStack.pop();
    }
    if (char === '(') parensStack.push({ line: lineNum + 1, char: i + 1 });
    if (char === ')') {
      if (parensStack.length === 0) console.log(`Extra ) at line ${lineNum + 1}:${i + 1}`);
      else parensStack.pop();
    }
    if (char === '[') bracketsStack.push({ line: lineNum + 1, char: i + 1 });
    if (char === ']') {
      if (bracketsStack.length === 0) console.log(`Extra ] at line ${lineNum + 1}:${i + 1}`);
      else bracketsStack.pop();
    }
  }
}

console.log('Unclosed braces:');
bracesStack.forEach(b => console.log(`Line ${b.line}, col ${b.char}`));
console.log('Unclosed parens:');
parensStack.forEach(p => console.log(`Line ${p.line}, col ${p.char}`));
console.log('Unclosed brackets:');
bracketsStack.forEach(b => console.log(`Line ${b.line}, col ${b.char}`));
