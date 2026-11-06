export interface RtfRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
}
export interface RtfDocument {
  paragraphs: RtfRun[][];
}
export interface RtfLimits {
  maxCharacters?: number;
  maxParagraphs?: number;
  maxRuns?: number;
}

function getLimits(options: RtfLimits = {}) {
  const limits = {
    maxCharacters: options.maxCharacters ?? 1_000_000,
    maxParagraphs: options.maxParagraphs ?? 100_000,
    maxRuns: options.maxRuns ?? 200_000,
  };
  if (
    Object.values(limits).some((item) => !Number.isSafeInteger(item) || item < 1) ||
    limits.maxCharacters > 20_000_000 ||
    limits.maxParagraphs > 500_000 ||
    limits.maxRuns > 1_000_000
  )
    throw new RangeError('RTF limits must be positive safe integers.');
  return limits;
}

function escapeRtf(text: string): string {
  let output = '';
  for (const character of text) {
    const code = character.codePointAt(0)!;
    if (character === '\\' || character === '{' || character === '}') output += `\\${character}`;
    else if (code >= 0x20 && code <= 0x7e) output += character;
    else if (code === 10) output += '\\line ';
    else if (code <= 0xffff) output += `\\u${code > 0x7fff ? code - 0x10000 : code}?`;
    else {
      const value = character.codePointAt(0)! - 0x10000;
      output += `\\u${0xd800 + (value >> 10)}?\\u${0xdc00 + (value & 0x3ff)}?`;
    }
  }
  return output;
}

export function writeRtfDocument(document: RtfDocument, options: RtfLimits = {}): string {
  const bound = getLimits(options);
  if (
    !document ||
    !Array.isArray(document.paragraphs) ||
    document.paragraphs.length < 1 ||
    document.paragraphs.length > bound.maxParagraphs
  )
    throw new RangeError('Invalid or oversized RTF document.');
  let characters = 0;
  let runs = 0;
  const content = document.paragraphs
    .map((paragraph) => {
      if (!Array.isArray(paragraph)) throw new TypeError('Paragraphs must be run arrays.');
      return paragraph
        .map((run) => {
          if (
            !run ||
            typeof run.text !== 'string' ||
            (run.bold !== undefined && typeof run.bold !== 'boolean') ||
            (run.italic !== undefined && typeof run.italic !== 'boolean')
          )
            throw new TypeError('Invalid RTF run.');
          characters += run.text.length;
          if (++runs > bound.maxRuns || characters > bound.maxCharacters)
            throw new RangeError('RTF content limit exceeded.');
          return `${run.bold ? '\\b ' : ''}${run.italic ? '\\i ' : ''}${escapeRtf(run.text)}${run.italic ? '\\i0 ' : ''}${run.bold ? '\\b0 ' : ''}`;
        })
        .join('');
    })
    .join('\\par ');
  return `{\\rtf1\\ansi\\deff0\\uc1 ${content}}`;
}

export function readRtfDocument(input: string, options: RtfLimits = {}): RtfDocument {
  const bound = getLimits(options);
  if (typeof input !== 'string') throw new TypeError('RTF input must be a string.');
  if (input.length > bound.maxCharacters * 8 + 100_000)
    throw new RangeError('RTF input exceeds configured size limit.');
  const paragraphs: RtfRun[][] = [[]];
  const stack: Array<{ bold: boolean; italic: boolean; uc: number }> = [];
  let state = { bold: false, italic: false, uc: 1 };
  let text = '';
  let runCount = 0;
  let characters = 0;
  let headerSeen = false;
  let skipFallback = 0;
  let rootClosed = false;
  const flush = () => {
    if (!text) return;
    const currentParagraph = paragraphs[paragraphs.length - 1]!;
    const previous = currentParagraph.at(-1);
    if (
      previous &&
      Boolean(previous.bold) === state.bold &&
      Boolean(previous.italic) === state.italic
    )
      previous.text += text;
    else
      currentParagraph.push({
        text,
        ...(state.bold ? { bold: true } : {}),
        ...(state.italic ? { italic: true } : {}),
      });
    text = '';
    if (++runCount > bound.maxRuns) throw new RangeError('RTF run limit exceeded.');
  };
  const append = (value: string) => {
    if (skipFallback) {
      skipFallback--;
      return;
    }
    text += value;
    characters += value.length;
    if (characters > bound.maxCharacters) throw new RangeError('RTF text limit exceeded.');
  };
  if (!input.startsWith('{\\rtf1')) throw new SyntaxError('Expected an RTF 1 document root.');
  for (let index = 0; index < input.length; index++) {
    if (rootClosed) throw new SyntaxError('Unexpected content after the RTF root.');
    const character = input[index]!;
    if (character === '{') {
      if (rootClosed || (stack.length === 0 && index !== 0))
        throw new SyntaxError('Unexpected group outside the RTF root.');
      flush();
      stack.push({ ...state });
      continue;
    }
    if (character === '}') {
      flush();
      const parent = stack.pop();
      if (!parent) throw new SyntaxError('Unexpected closing group.');
      state = parent;
      if (stack.length === 0) rootClosed = true;
      continue;
    }
    if (character !== '\\') {
      if (character === '\r' || character === '\n') continue;
      append(character);
      continue;
    }
    const next = input[++index];
    if (!next) throw new SyntaxError('Trailing RTF escape.');
    if ('\\{}'.includes(next)) {
      append(next);
      continue;
    }
    if (next === "'") {
      const hex = input.slice(index + 1, index + 3);
      if (!/^[\da-fA-F]{2}$/.test(hex)) throw new SyntaxError('Malformed RTF hex escape.');
      const byte = Number.parseInt(hex, 16);
      if (byte > 0x7f)
        throw new SyntaxError('Non-ASCII hex escapes require an unspecified code page.');
      append(String.fromCharCode(byte));
      index += 2;
      continue;
    }
    if (!/[A-Za-z]/.test(next)) {
      if (next === '~') append('\u00a0');
      else if (next === '-') append('\u00ad');
      else throw new SyntaxError(`Unsupported RTF control symbol \\${next}.`);
      continue;
    }
    let word = next;
    while (/[A-Za-z]/.test(input[index + 1] ?? '')) word += input[++index];
    let number: number | undefined;
    if (input[index + 1] === '-') {
      index++;
      let digits = '';
      while (/\d/.test(input[index + 1] ?? '')) digits += input[++index];
      if (!digits) throw new SyntaxError(`Malformed numeric control ${word}.`);
      number = -Number(digits);
    } else if (/\d/.test(input[index + 1] ?? '')) {
      let digits = '';
      while (/\d/.test(input[index + 1] ?? '')) digits += input[++index];
      number = Number(digits);
    }
    if (input[index + 1] === ' ') index++;
    if (word === 'rtf') {
      if (number !== 1 || headerSeen) throw new SyntaxError('Only RTF version 1 is supported.');
      headerSeen = true;
    } else if (word === 'ansi' || word === 'deff') {
      if (word === 'deff' && !Number.isSafeInteger(number))
        throw new SyntaxError('Malformed default font control.');
    } else if (word === 'uc') {
      if (!Number.isInteger(number) || number! < 0 || number! > 8)
        throw new SyntaxError('Unicode fallback count must be 0–8.');
      state.uc = number!;
    } else if (word === 'b' || word === 'i') {
      flush();
      state = { ...state, [word === 'b' ? 'bold' : 'italic']: number !== 0 };
    } else if (word === 'par') {
      flush();
      if (paragraphs.length >= bound.maxParagraphs)
        throw new RangeError('Paragraph limit exceeded.');
      paragraphs.push([]);
    } else if (word === 'line') append('\n');
    else if (word === 'tab') append('\t');
    else if (word === 'u') {
      if (!Number.isInteger(number) || number! < -32768 || number! > 32767)
        throw new SyntaxError('Unicode control must be a signed 16-bit integer.');
      const code = number! < 0 ? number! + 65536 : number!;
      append(String.fromCharCode(code));
      skipFallback = state.uc;
    } else throw new SyntaxError(`Unsupported RTF control word: \\${word}.`);
  }
  flush();
  if (stack.length || !rootClosed || !headerSeen || input.at(-1) !== '}')
    throw new SyntaxError('Unclosed or malformed RTF document.');
  return { paragraphs };
}
