# @lp-labs/rtf-codec

Bounded safe ASCII/Unicode RTF subset reader/writer with explicit control-word rejection.

## Install

```sh
npm install @lp-labs/rtf-codec
```

## Quick start

```js
import { writeRtfDocument, readRtfDocument } from '@lp-labs/rtf-codec';

const document = { paragraphs: [[{ text: 'Hello', bold: true }]] };
const rtf = writeRtfDocument(document);
console.log(readRtfDocument(rtf).paragraphs[0][0].text);
```

## API and supported subset

`RtfDocument` is a list of paragraphs, each a list of `{ text, bold?, italic? }` runs. `writeRtfDocument(document, limits?)` emits RTF 1; `readRtfDocument(input, limits?)` returns this model.

Supported controls are the writer header (`\rtf1`, `\ansi`, `\deffN`, `\ucN`), `\b`, `\i`, `\par`, `\line`, `\tab`, and signed UTF-16 `\uN` plus fallback. Escaped braces/backslashes and ASCII `\'hh` are supported. Non-ASCII hex bytes are rejected because the codec never guesses an ANSI code page. Other control words (including `\bin`), destinations, font/color tables, pictures, fields, nested formatting features, and complete RTF interoperability are deliberately unsupported.

Limits default to 1,000,000 text characters, 100,000 paragraphs, and 200,000 runs, with ceilings of 20,000,000 characters, 500,000 paragraphs, and 1,000,000 runs. Encoded input is capped at `maxCharacters × 8 + 100,000`. Invalid values throw `TypeError`/`RangeError`; malformed syntax and every unsupported control word/symbol throw `SyntaxError`. Parsing is single-pass and linear in input size.

## Customization and limitations

Use a format-aware provider or extend the control-word policy when compatibility with other RTF producers is required. Keep unknown destinations out of this parser; they are rejected, not skipped or executed.

## Module formats

ESM, CommonJS, and TypeScript declarations are included. CommonJS: `const api = require('@lp-labs/rtf-codec')`. There are no runtime or peer dependencies; TypeScript and Prettier are development-only.

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
