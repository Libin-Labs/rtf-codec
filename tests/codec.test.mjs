import test from 'node:test';
import assert from 'node:assert/strict';
import { readRtfDocument, writeRtfDocument } from '../dist/esm/index.js';

test('round-trips braces, bold, italic, Unicode, and paragraph breaks', () => {
  const document = {
    paragraphs: [
      [
        { text: 'Hi {世界}', bold: true },
        { text: ' ok', italic: true },
      ],
      [{ text: 'next' }],
    ],
  };
  assert.deepEqual(readRtfDocument(writeRtfDocument(document)), document);
});
test('reads ASCII escapes and Unicode fallback characters', () => {
  assert.deepEqual(
    readRtfDocument('{\\rtf1\\ansi\\uc1 caf\\' + "'41 \\u233?}").paragraphs[0][0].text,
    'cafA é',
  );
});
test('rejects malformed groups, binary data and unsupported control words', () => {
  assert.throws(() => readRtfDocument('{\\rtf1\\ansi\\bin10 abc}'), /Unsupported RTF control word/);
  assert.throws(() => readRtfDocument('{\\rtf1\\ansi {x}'), SyntaxError);
  assert.throws(() => readRtfDocument('{\\rtf1\\ansi\\fonttbl x}'), /Unsupported RTF control word/);
});
