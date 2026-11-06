import { writeRtfDocument, readRtfDocument, type RtfDocument } from '@lp-labs/rtf-codec';
const document: RtfDocument = { paragraphs: [[{ text: 'Hello', bold: true }]] };
const rtf = writeRtfDocument(document);
console.log(readRtfDocument(rtf).paragraphs[0][0].text);
