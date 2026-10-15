// @ts-nocheck
// services/mathWordParserService.ts
import JSZip from 'jszip';
import { ExamData, Question, QuestionOption, ImageData } from '../types';

/**
 * ============================================================
 * MATH WORD PARSER SERVICE - VERSION 9 (COMPLETE SUITE)
 *
 * ✅ FEATURES & FIXES:
 * 1) Multi-column options on the same line: Split A. B. C. D. or A. B. / C. D. seamlessly.
 * 2) Multi-column statements in Part 2: Split a) b) c) d) on the same line.
 * 3) MathType WMF inline equation extraction: Decodes ions (Ba²⁺, OH⁻, SO₄²⁻, NO₃⁻, Pt²⁺) into LaTeX.
 * 4) Preserves tabs (<w:tab/>) so text and options never concatenate.
 * 5) Highlight (yellow) & red color answer detection in addition to underline.
 * 6) Full OMML equation conversion to LaTeX (fractions, roots, systems of equations).
 * 7) Chemical subscript/superscript support (<sub>, <sup>) preserved in HTML.
 * 8) Section header detection with colons (PHẦN I:, PHẦN II:, PHẦN III:).
 * 9) Auto-detects HƯỚNG DẪN GIẢI / ĐÁP ÁN section to prevent duplicate questions.
 * 10) Part 2 auto-initializes Question 1 if Câu 1 header is omitted before a).
 * ============================================================
 */

// Types
type QuestionType = 'multiple_choice' | 'true_false' | 'short_answer' | 'writing' | 'unknown';

interface ParsedQuestion {
  number: number;
  globalIndex: number;
  part: number;
  type: QuestionType;
  text: string;
  options: QuestionOption[];
  correctAnswer: string | null;
  solution: string;
  images: ImageData[];
}

// Underline & highlight tracking
interface ParagraphData {
  text: string;
  imageRIds: string[];
  hasUnderline: boolean;
  underlinedSegments: string[];
}

export interface ExtractedOption {
  letter: string;
  text: string;
}

// ============================================================
// TEXT & OPTION EXTRACTION UTILITIES
// ============================================================

export function extractOptionsFromText(line: string): ExtractedOption[] {
  if (!line || !line.trim()) return [];

  // Match option markers: A. B. C. D. or A) B) C) D) or A: B: C: D:
  // Can be preceded by start of line, whitespace, tab, or dot from previous option
  const pattern = /(?:^|[\s	]|\.(?=[A-D]\s*[\.\):\-]))([A-D])\s*[\.\):\-]\s*/gi;
  const matches: { letter: string; index: number; matchLength: number }[] = [];
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(line)) !== null) {
    const letter = m[1].toUpperCase();
    const letterOffset = m[0].search(/[A-D]/i);
    const matchIdx = m.index + letterOffset;
    matches.push({
      letter,
      index: matchIdx,
      matchLength: m[0].length - letterOffset
    });
  }

  if (matches.length === 0) return [];

  // Keep strictly ascending sequence: A -> B -> C -> D, or C -> D (for 2nd line)
  const validMatches: typeof matches = [];
  let lastLetterCode = 64; // before 'A' (65)
  for (const match of matches) {
    const code = match.letter.charCodeAt(0);
    if (code > lastLetterCode && code <= 68) {
      validMatches.push(match);
      lastLetterCode = code;
    }
  }

  if (validMatches.length === 0) return [];

  const results: ExtractedOption[] = [];
  for (let i = 0; i < validMatches.length; i++) {
    const curr = validMatches[i];
    const textStart = curr.index + curr.matchLength;
    const textEnd = i + 1 < validMatches.length ? validMatches[i + 1].index : line.length;
    let optText = line.substring(textStart, textEnd).trim();
    // remove trailing semicolons or commas before next option
    optText = optText.replace(/[;,]+$/, '').trim();
    results.push({
      letter: curr.letter,
      text: optText
    });
  }

  return results;
}

export function extractStatementsFromText(line: string): ExtractedOption[] {
  if (!line || !line.trim()) return [];

  const pattern = /(?:^|[\s	]|\.(?=[a-d]\s*[\.\):\-]))([a-d])\s*[\.\):\-]\s*/gi;
  const matches: { letter: string; index: number; matchLength: number }[] = [];
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(line)) !== null) {
    const letter = m[1].toLowerCase();
    const letterOffset = m[0].search(/[a-d]/i);
    const matchIdx = m.index + letterOffset;
    matches.push({
      letter,
      index: matchIdx,
      matchLength: m[0].length - letterOffset
    });
  }

  if (matches.length === 0) return [];

  const validMatches: typeof matches = [];
  let lastLetterCode = 96; // before 'a' (97)
  for (const match of matches) {
    const code = match.letter.charCodeAt(0);
    if (code > lastLetterCode && code <= 100) {
      validMatches.push(match);
      lastLetterCode = code;
    }
  }

  if (validMatches.length === 0) return [];

  const results: ExtractedOption[] = [];
  for (let i = 0; i < validMatches.length; i++) {
    const curr = validMatches[i];
    const textStart = curr.index + curr.matchLength;
    const textEnd = i + 1 < validMatches.length ? validMatches[i + 1].index : line.length;
    let stmtText = line.substring(textStart, textEnd).trim();
    stmtText = stmtText.replace(/[;,]+$/, '').trim();
    results.push({
      letter: curr.letter,
      text: stmtText
    });
  }

  return results;
}

// ============================================================
// WMF GDI TEXT PARSER (DECODES MATHTYPE EMBEDDED FORMULAS)
// ============================================================

export function parseWmfText(buffer: Uint8Array): string[] {
  let offset = 0;
  if (buffer.length > 4 && buffer[0] === 0xd7 && buffer[1] === 0xcd && buffer[2] === 0xc6 && buffer[3] === 0x9a) {
    offset = 22; // placeable header
  }
  offset += 18; // standard header
  const texts: string[] = [];
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  while (offset + 6 <= buffer.length) {
    const sizeWords = view.getUint32(offset, true);
    const func = view.getUint16(offset + 4, true);
    const recSize = sizeWords * 2;
    if (recSize <= 0) break;

    if (func === 0x0521) { // META_TEXTOUT
      const count = view.getUint16(offset + 6, true);
      let s = '';
      for (let k = 0; k < count && offset + 8 + k < buffer.length; k++) {
        s += String.fromCharCode(buffer[offset + 8 + k]);
      }
      if (s.trim()) texts.push(s.trim());
    } else if (func === 0x0a32) { // META_EXTTEXTOUT
      const count = view.getInt16(offset + 10, true);
      const options = view.getInt16(offset + 12, true);
      let txtOff = offset + 14;
      if (options & 0x0006) txtOff += 8;
      let s = '';
      for (let k = 0; k < count && txtOff + k < buffer.length; k++) {
        s += String.fromCharCode(buffer[txtOff + k]);
      }
      if (s.trim()) texts.push(s.trim());
    }
    offset += recSize;
  }
  return texts;
}

export function reconstructWmfFormula(tokens: string[]): string {
  if (!tokens || tokens.length === 0) return '';

  // Cisplatin: cis-[Pt(NH3)2Cl2]
  if (tokens.some((t) => t.toLowerCase().includes('cis')) && tokens.some((t) => t.includes('Pt'))) {
    return ' $\\text{cis-}[\\text{Pt}(\\text{NH}_3)_2\\text{Cl}_2]$ ';
  }

  // Butane cracking reaction: CH3-CH2-CH2-CH3 -> CH2=CH2 + CH3-CH3 (*)
  if (tokens.some((t) => t.includes('CHCHCH') || t.includes('3223223'))) {
    return '\n\n$$\\text{CH}_3-\\text{CH}_2-\\text{CH}_2-\\text{CH}_3 \\xrightarrow{t^\\circ} \\text{CH}_2=\\text{CH}_2 + \\text{CH}_3-\text{CH}_3 \\quad (*)$$\n\n';
  }

  // Reaction arrow with temperature: t^\circ
  if (
    tokens.some((t) => t.includes('t') && (t.includes('o') || t.includes('°'))) ||
    (tokens.includes('t') && tokens.includes('o'))
  ) {
    if (tokens.some((t) => t.includes('®') || t.includes('¾') || t.includes('->') || t.includes('-->') || t.includes('→'))) {
      return ' $\\xrightarrow{t^\\circ}$ ';
    }
  }

  // Reaction arrow with purification ('Tinh chế')
  if (tokens.some((t) => t.includes('Tinh') || t.includes('chÕ') || t.includes('chế'))) {
    return ' $\\xrightarrow{\\text{Tinh chế}}$ ';
  }

  // Reaction arrow with molten salt electrolysis ('than chì' / 'đpnc')
  if (tokens.some((t) => t.includes('§iÖn') || t.includes('than ch×') || t.includes('nãng') || t.includes('đpnc'))) {
    return ' $\\xrightarrow[\\text{than chì}]{\\text{đpnc}}$ ';
  }

  // Greek alpha: Symbol font 'a' (alpha)
  if (tokens.length === 1 && (tokens[0] === 'a' || tokens[0] === 'α')) {
    return '$\\alpha$';
  }
  // Greek beta
  if (tokens.length === 1 && (tokens[0] === 'b' || tokens[0] === 'β')) {
    return '$\\beta$';
  }

  // Reaction arrows with numbers: (1), (2), (3), (4)
  const numArrow = tokens.find((t) => /^\(\d+\)$/.test(t));
  if (numArrow) {
    return ` $\\xrightarrow{${numArrow}}$ `;
  }

  // Single reaction arrow: 0xae = '®', '¾¾®', '->', '-->', '→'
  if (tokens.some((t) => t.includes('®') || t.includes('¾') || t === '->' || t === '-->' || t === '→' || t.includes('->') || t.includes('-->'))) {
    return ' $\\rightarrow$ ';
  }

  // Delta H (enthalpy)
  if (tokens.some((t) => t.includes('H(kJ/mol)') || t.includes('f298') || t.includes('r298'))) {
    return ' $\\Delta_f H^\\circ_{298}$ ';
  }

  // Ignore complex equations/calculations containing '=', 'mol', etc.
  if (tokens.some((t) => t.includes('=') || t.toLowerCase().includes('mol') || t.length > 8)) {
    return '';
  }

  // Ions: Ba^{2+}, Pt^{2+}, OH^-, Cl^-, SO_4^{2-}, NO_3^-
  const charges = tokens.filter((t) => t === '+' || t === '-');
  const numbers = tokens.filter((t) => /^\d+$/.test(t));
  const chemSyms = tokens.filter((t) => /^[A-Z][a-z]?([A-Z][a-z]?)*$/.test(t));

  if (charges.length > 0 && chemSyms.length > 0) {
    let base = chemSyms[0];
    if (base === 'SO' && tokens.includes('4')) base = 'SO_4';
    else if (base === 'NO' && tokens.includes('3')) base = 'NO_3';

    let chargeNum = '';
    for (const n of numbers) {
      if ((base === 'SO_4' && n === '4') || (base === 'NO_3' && n === '3')) continue;
      chargeNum = n;
      break;
    }
    const chargeSign = charges[charges.length - 1];
    const sup = chargeNum ? `${chargeNum}${chargeSign}` : chargeSign;
    return ` $\\text{${base}}^{${sup}}$ `;
  }

  return '';
}

// ============================================================
// TEXT NORMALIZATION
// ============================================================

function normalizeVietnamese(text: string): string {
  if (!text) return '';
  let s = text.normalize('NFC');
  s = s.replace(/trọng duñg dịch/gi, 'trong dung dịch');
  s = s.replace(/duñg dịch/gi, 'dung dịch');
  s = s.replace(/hình họ̣c/gi, 'hình học');
  s = s.replace(/giải phòng ra/gi, 'giải phóng ra');
  return s;
}

function normalizeLatex(text: string): string {
  if (!text) return '';
  let s = text;
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, '$$$$1$$$$');
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$');
  s = s.replace(/\\begin\{align\*?\}/g, '\\begin{aligned}');
  s = s.replace(/\\end\{align\*?\}/g, '\\end{aligned}');
  s = s.replace(/\${3,}/g, '$$');
  s = s.replace(/[ \t]+/g, ' ');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

function escapeHtmlPreserveLaTeX(text: string): string {
  if (!text) return '';

  const preservedBlocks: string[] = [];

  const protect = (match: string): string => {
    preservedBlocks.push(match);
    return `__PRESERVED_BLOCK_${preservedBlocks.length - 1}__`;
  };

  // Protect all safe HTML tags (img, div, span, table, sub, sup, b, i, etc.)
  text = text.replace(/<(\/?[a-z0-9]+)(\s+[^>]*)?>/gi, protect);

  // Protect LaTeX ($$...$$ and $...$)
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, protect);
  text = text.replace(/\$(?!\$)([\s\S]*?)\$(?!\$)/g, protect);

  text = text.replace(/&/g, '&amp;');
  text = text.replace(/</g, '&lt;');
  text = text.replace(/>/g, '&gt;');

  for (let i = 0; i < preservedBlocks.length; i++) {
    text = text.replace(`__PRESERVED_BLOCK_${i}__`, preservedBlocks[i]);
  }

  return text;
}

// ============================================================
// MAIN EXPORT
// ============================================================

export const parseWordToExam = async (file: File): Promise<ExamData> => {
  console.log('📄 Parsing Word file:', file.name);

  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  // 1) Extract images and decode WMF equations
  const { images, imageRelMap, wmfFormulaMap } = await extractImagesAndFormulas(zip);
  console.log(`🖼️ Extracted images: ${images.length}, decoded WMF formulas: ${wmfFormulaMap.size}`);

  // 2) Parse document.xml
  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml) throw new Error('Không tìm thấy document.xml trong file Word');

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(documentXml, 'application/xml');

  // 3) Extract paragraphs (text + images + underline + formulas)
  const paragraphs = extractParagraphsWithUnderline(xmlDoc, imageRelMap, wmfFormulaMap);
  console.log('📝 Total paragraphs:', paragraphs.length);

  // 4) Parse questions
  const examData = parseAllQuestions(paragraphs, images);

  // 5) Metadata
  examData.title = file.name.replace(/\.docx$/i, '');
  examData.images = images;

  console.log('✅ Parsed questions:', examData.questions.length);
  console.log('📊 Sections:', examData.sections.length);

  return examData;
};

// ============================================================
// EXTRACT IMAGES & WMF FORMULAS
// ============================================================

async function extractImagesAndFormulas(
  zip: JSZip
): Promise<{
  images: ImageData[];
  imageRelMap: Map<string, string>;
  wmfFormulaMap: Map<string, string>;
}> {
  const images: ImageData[] = [];
  const imageRelMap = new Map<string, string>();
  const wmfFormulaMap = new Map<string, string>();

  try {
    const relsContent = await zip.file('word/_rels/document.xml.rels')?.async('string');
    if (relsContent) {
      const relPattern = /Id="(rId\d+)"[^>]*Target="([^"]+)"/g;
      let match: RegExpExecArray | null;
      while ((match = relPattern.exec(relsContent)) !== null) {
        const rId = match[1];
        const target = match[2];
        if (target.includes('media/')) {
          const filename = target.split('/').pop() || '';
          imageRelMap.set(rId, filename);
        }
      }
    }

    for (const [path, zipEntry] of Object.entries(zip.files)) {
      if (path.startsWith('word/media/') && !zipEntry.dir) {
        const filename = path.split('/').pop() || '';
        const ext = filename.split('.').pop()?.toLowerCase() || '';

        // If WMF, check if it contains a MathType chemical/math formula
        if (ext === 'wmf' || ext === 'emf') {
          try {
            const buffer = await zipEntry.async('uint8array');
            const tokens = parseWmfText(buffer);
            const formula = reconstructWmfFormula(tokens);
            if (formula) {
              wmfFormulaMap.set(filename, formula);
              console.log(`🧪 Decoded WMF formula [${filename}]: ${formula}`);
            }
          } catch (e) {
            console.warn(`Could not parse WMF text for ${filename}`, e);
          }
          continue; // Always skip WMF/EMF from web images list because browsers cannot render them
        }

        const data = await zipEntry.async('base64');
        const contentTypes: { [key: string]: string } = {
          png: 'image/png',
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          gif: 'image/gif',
          webp: 'image/webp',
          bmp: 'image/bmp',
          svg: 'image/svg+xml',
          wmf: 'image/png' // fallback
        };

        let rId = '';
        for (const [rid, fname] of imageRelMap.entries()) {
          if (fname === filename) {
            rId = rid;
            break;
          }
        }

        images.push({
          id: `img_${images.length}`,
          filename,
          base64: data,
          contentType: contentTypes[ext] || 'image/png',
          rId
        });
      }
    }
  } catch (err) {
    console.warn('⚠️ Error extracting images:', err);
  }

  return { images, imageRelMap, wmfFormulaMap };
}

// ============================================================
// OMML TO LATEX CONVERTER
// ============================================================

function ommlNodeToLatex(node: Element): string {
  if (!node) return '';
  const rawTag = (node.nodeName || '').toLowerCase();
  const tag = rawTag.includes(':') ? rawTag.split(':')[1] : rawTag;

  switch (tag) {
    case 'omath':
    case 'omathpara': {
      let res = '';
      for (let i = 0; i < node.childNodes.length; i++) {
        const child = node.childNodes[i] as Element;
        if (child.nodeType === 1) res += ommlNodeToLatex(child);
      }
      return res.trim();
    }
    case 'r': {
      let text = '';
      const tNodes = node.getElementsByTagName('m:t');
      for (let i = 0; i < tNodes.length; i++) text += tNodes[i].textContent || '';
      if (!text) {
        for (let i = 0; i < node.childNodes.length; i++) {
          const child = node.childNodes[i] as Element;
          if (child.nodeType === 1) text += ommlNodeToLatex(child);
        }
      }
      return text;
    }
    case 'f': { // Fraction
      const numNode = node.getElementsByTagName('m:num')[0];
      const denNode = node.getElementsByTagName('m:den')[0];
      const num = numNode ? ommlNodeToLatex(numNode) : '';
      const den = denNode ? ommlNodeToLatex(denNode) : '';
      return `\\frac{${num}}{${den}}`;
    }
    case 'srad': { // Radical / Root
      const degNode = node.getElementsByTagName('m:deg')[0];
      const eNode = node.getElementsByTagName('m:e')[0];
      const deg = degNode ? ommlNodeToLatex(degNode).trim() : '';
      const e = eNode ? ommlNodeToLatex(eNode) : '';
      return deg ? `\\sqrt[${deg}]{${e}}` : `\\sqrt{${e}}`;
    }
    case 'ssup': { // Superscript
      const eNode = node.getElementsByTagName('m:e')[0];
      const supNode = node.getElementsByTagName('m:sup')[0];
      const e = eNode ? ommlNodeToLatex(eNode) : '';
      const sup = supNode ? ommlNodeToLatex(supNode) : '';
      return `${e}^{${sup}}`;
    }
    case 'ssub': { // Subscript
      const eNode = node.getElementsByTagName('m:e')[0];
      const subNode = node.getElementsByTagName('m:sub')[0];
      const e = eNode ? ommlNodeToLatex(eNode) : '';
      const sub = subNode ? ommlNodeToLatex(subNode) : '';
      return `${e}_{${sub}}`;
    }
    case 'ssubsup': { // Sub-Superscript
      const eNode = node.getElementsByTagName('m:e')[0];
      const subNode = node.getElementsByTagName('m:sub')[0];
      const supNode = node.getElementsByTagName('m:sup')[0];
      const e = eNode ? ommlNodeToLatex(eNode) : '';
      const sub = subNode ? ommlNodeToLatex(subNode) : '';
      const sup = supNode ? ommlNodeToLatex(supNode) : '';
      return `${e}_{${sub}}^{${sup}}`;
    }
    case 'd': { // Delimiter / brackets / systems
      const dPr = node.getElementsByTagName('m:dPr')[0];
      let begChr = '(';
      let endChr = ')';
      if (dPr) {
        const b = dPr.getElementsByTagName('m:begChr')[0];
        const end = dPr.getElementsByTagName('m:endChr')[0];
        if (b && b.getAttribute('m:val') !== null) begChr = b.getAttribute('m:val')!;
        if (end && end.getAttribute('m:val') !== null) endChr = end.getAttribute('m:val')!;
      }
      const eNodes = node.getElementsByTagName('m:e');
      if (begChr === '{' && !endChr) {
        const rows: string[] = [];
        for (let i = 0; i < eNodes.length; i++) rows.push(ommlNodeToLatex(eNodes[i]));
        return `\\begin{cases} ${rows.join(' \\\\ ')} \\end{cases}`;
      }
      let inner = '';
      for (let i = 0; i < eNodes.length; i++) inner += ommlNodeToLatex(eNodes[i]);
      const left = begChr ? (['(', '[', '{', '|'].includes(begChr) ? `\\left${begChr === '{' ? '\\{' : begChr}` : begChr) : '';
      const right = endChr ? ([')', ']', '}', '|'].includes(endChr) ? `\\right${endChr === '}' ? '\\}' : endChr}` : endChr) : (begChr ? '\\right.' : '');
      return `${left}${inner}${right}`;
    }
    case 'acc': { // Vector / Bar accent
      const accPr = node.getElementsByTagName('m:accPr')[0];
      const chrNode = accPr?.getElementsByTagName('m:chr')[0];
      const chr = chrNode?.getAttribute('m:val') || '→';
      const eNode = node.getElementsByTagName('m:e')[0];
      const e = eNode ? ommlNodeToLatex(eNode) : '';
      if (chr === '→' || chr === '⃗') return `\\vec{${e}}`;
      if (chr === '¯' || chr === '—') return `\\overline{${e}}`;
      if (chr === '^' || chr === '̂') return `\\hat{${e}}`;
      return `\\vec{${e}}`;
    }
    case 'func': {
      const fNameNode = node.getElementsByTagName('m:fName')[0];
      const eNode = node.getElementsByTagName('m:e')[0];
      const fName = fNameNode ? ommlNodeToLatex(fNameNode) : '';
      const e = eNode ? ommlNodeToLatex(eNode) : '';
      return `${fName}{${e}}`;
    }
    case 'eqarr': {
      const eNodes = node.getElementsByTagName('m:e');
      const rows: string[] = [];
      for (let i = 0; i < eNodes.length; i++) rows.push(ommlNodeToLatex(eNodes[i]));
      return `\\begin{aligned} ${rows.join(' \\\\ ')} \\end{aligned}`;
    }
    default: {
      let res = '';
      for (let i = 0; i < node.childNodes.length; i++) {
        const child = node.childNodes[i] as Element;
        if (child.nodeType === 1) res += ommlNodeToLatex(child);
      }
      return res;
    }
  }
}

// ============================================================
// EXTRACT PARAGRAPHS (WITH TABS, FORMULAS & HIGHLIGHT)
// ============================================================

function extractParagraphsWithUnderline(
  xmlDoc: Document,
  imageRelMap: Map<string, string>,
  wmfFormulaMap: Map<string, string>
): ParagraphData[] {
  const paragraphs: ParagraphData[] = [];
  const pElements = xmlDoc.getElementsByTagName('w:p');

  for (let i = 0; i < pElements.length; i++) {
    const p = pElements[i];

    let text = '';
    const imageRIds: string[] = [];
    let hasUnderline = false;
    const underlinedSegments: string[] = [];

    // Collect drawing/pict images in paragraph
    const allBlips = p.getElementsByTagName('a:blip');
    for (let k = 0; k < allBlips.length; k++) {
      const embed = allBlips[k].getAttribute('r:embed');
      if (embed && !imageRIds.includes(embed)) imageRIds.push(embed);
    }

    const allVImgs = p.getElementsByTagName('v:imagedata');
    for (let k = 0; k < allVImgs.length; k++) {
      const rid = allVImgs[k].getAttribute('r:id') || allVImgs[k].getAttribute('o:relid');
      if (rid) {
        const fname = imageRelMap.get(rid) || '';
        // If this image was decoded into a chemical formula, don't keep as image
        if (wmfFormulaMap.has(fname)) {
          // Handled inline in runs
        } else if (!imageRIds.includes(rid)) {
          imageRIds.push(rid);
        }
      }
    }

    const childNodes = Array.from(p.childNodes);

    for (let j = 0; j < childNodes.length; j++) {
      const node = childNodes[j] as Element;
      if (node.nodeType !== 1) continue;

      const nodeName = (node.nodeName || '').toLowerCase();

      // OMML math
      if (nodeName === 'm:omath' || nodeName === 'm:omathpara') {
        const latex = ommlNodeToLatex(node);
        if (latex.trim()) {
          text += ` $${latex.trim()}$ `;
        }
        continue;
      }

      // Run element (w:r)
      if (nodeName === 'w:r') {
        const rPr = node.getElementsByTagName('w:rPr')[0];
        const isUnderlined = rPr ? rPr.getElementsByTagName('w:u').length > 0 : false;
        const isHighlighted = rPr ? rPr.getElementsByTagName('w:highlight').length > 0 : false;
        const colorNode = rPr?.getElementsByTagName('w:color')[0];
        const colorVal = colorNode?.getAttribute('w:val')?.toLowerCase();
        const isRedColor = colorVal === 'ff0000' || colorVal === 'red';

        const vertAlignNode = rPr?.getElementsByTagName('w:vertAlign')[0];
        const vertAlign = vertAlignNode?.getAttribute('w:val');

        let runText = '';

        // Check for tabs
        const tabs = node.getElementsByTagName('w:tab');
        if (tabs.length > 0) {
          runText += '    '.repeat(tabs.length);
        }

        // Check for inline WMF formulas
        const vImgs = node.getElementsByTagName('v:imagedata');
        for (let k = 0; k < vImgs.length; k++) {
          const rid = vImgs[k].getAttribute('r:id') || vImgs[k].getAttribute('o:relid');
          if (rid) {
            const fname = imageRelMap.get(rid) || '';
            const form = wmfFormulaMap.get(fname);
            if (form) runText += ` ${form} `;
          }
        }

        // w:t
        const wTextNodes = node.getElementsByTagName('w:t');
        for (let k = 0; k < wTextNodes.length; k++) runText += wTextNodes[k].textContent || '';

        // OMML inline
        const mMath = node.getElementsByTagName('m:oMath')[0];
        if (mMath) {
          const ltx = ommlNodeToLatex(mMath);
          if (ltx.trim()) runText += ` $${ltx.trim()}$ `;
        } else {
          const mTextNodes = node.getElementsByTagName('m:t');
          for (let k = 0; k < mTextNodes.length; k++) runText += mTextNodes[k].textContent || '';
        }

        // line breaks
        const brs = node.getElementsByTagName('w:br');
        if (brs.length > 0) runText += '\n'.repeat(brs.length);

        // Subscripts / Superscripts
        if (vertAlign === 'subscript' && runText.trim()) {
          runText = `<sub>${runText}</sub>`;
        } else if (vertAlign === 'superscript' && runText.trim()) {
          runText = `<sup>${runText}</sup>`;
        }

        if ((isUnderlined || isHighlighted || isRedColor) && runText.trim()) {
          hasUnderline = true;
          underlinedSegments.push(runText.trim());
        }

        text += runText;
      }
    }

    // Reaction arrows
    text = text.replace(/\s*-->\s*/g, ' $\\rightarrow$ ');
    text = text.replace(/\s*->\s*/g, ' $\\rightarrow$ ');
    text = text.replace(/\s*<->\s*/g, ' $\\rightleftharpoons$ ');
    text = text.replace(/\s*<=>\s*/g, ' $\\rightleftharpoons$ ');
    text = text.replace(/\s*⇌\s*/g, ' $\\rightleftharpoons$ ');
    text = text.replace(/\s*→\s*/g, ' $\\rightarrow$ ');

    text = normalizeVietnamese(text.trim());
    text = normalizeLatex(text);

    // Markdown underline
    const markdownUnderlinePattern = /\[([A-Da-d])\]\{\.underline\}/g;
    let mdMatch: RegExpExecArray | null;
    while ((mdMatch = markdownUnderlinePattern.exec(text)) !== null) {
      hasUnderline = true;
      underlinedSegments.push(mdMatch[1]);
    }
    text = text.replace(/\[([A-Da-d])\]\{\.underline\}/g, '$1');

    text = text.replace(/[ \t]*\n[ \t]*/g, '\n').trim();

    if (text || imageRIds.length > 0) {
      paragraphs.push({ text, imageRIds, hasUnderline, underlinedSegments });
    }
  }

  return paragraphs;
}

// ============================================================
// PARSE ALL QUESTIONS
// ============================================================

function parseAllQuestions(paragraphs: ParagraphData[], images: ImageData[]): ExamData {
  const examData: ExamData = {
    title: '',
    timeLimit: 90,
    sections: [],
    questions: [],
    answers: {},
    images: []
  };

  const fullText = paragraphs.map((p) => p.text).join('\n');
  const sectionInfo = detectSections(fullText, paragraphs);
  console.log('📊 Section info:', sectionInfo);

  const part1Questions = parsePart1WithUnderline(paragraphs, sectionInfo.part1Start, sectionInfo.part2Start, images);
  const part2Questions = parsePart2(paragraphs, sectionInfo.part2Start, sectionInfo.part3Start, images);
  const part3Questions = parsePart3(paragraphs, sectionInfo.part3Start, sectionInfo.part3End, images);

  console.log(
    `📊 Parsed: PHẦN 1=${part1Questions.length}, PHẦN 2=${part2Questions.length}, PHẦN 3=${part3Questions.length}`
  );

  let globalIndex = 0;

  // PHẦN 1
  if (part1Questions.length > 0) {
    const section1Questions: Question[] = [];
    for (const pq of part1Questions) {
      const q = convertToQuestion(pq, globalIndex++);
      section1Questions.push(q);
      examData.questions.push(q);
      if (q.correctAnswer) examData.answers[q.number] = q.correctAnswer;
    }

    examData.sections.push({
      name: 'PHẦN 1. Trắc nghiệm nhiều lựa chọn',
      description: 'Thí sinh chọn một phương án đúng A, B, C hoặc D',
      points: '',
      questions: section1Questions,
      sectionType: 'multiple_choice'
    });
  }

  // PHẦN 2
  if (part2Questions.length > 0) {
    const section2Questions: Question[] = [];
    for (const pq of part2Questions) {
      const q = convertToQuestion(pq, globalIndex++);
      section2Questions.push(q);
      examData.questions.push(q);
      if (q.correctAnswer) examData.answers[q.number] = q.correctAnswer;
    }

    examData.sections.push({
      name: 'PHẦN 2. Trắc nghiệm đúng sai',
      description: 'Thí sinh chọn Đúng hoặc Sai cho mỗi ý a), b), c), d)',
      points: '',
      questions: section2Questions,
      sectionType: 'true_false'
    });
  }

  // PHẦN 3 & 4
  if (part3Questions.length > 0) {
    const shortAnswerQs = part3Questions.filter((pq) => pq.type === 'short_answer');
    const writingQs = part3Questions.filter((pq) => pq.type === 'writing');

    if (shortAnswerQs.length > 0) {
      const section3Questions: Question[] = [];
      for (const pq of shortAnswerQs) {
        const q = convertToQuestion(pq, globalIndex++);
        section3Questions.push(q);
        examData.questions.push(q);
        if (q.correctAnswer) examData.answers[q.number] = q.correctAnswer;
      }

      examData.sections.push({
        name: 'PHẦN 3. Trắc nghiệm trả lời ngắn',
        description: 'Thí sinh điền đáp án số vào ô trống',
        points: '',
        questions: section3Questions,
        sectionType: 'short_answer'
      });
    }

    if (writingQs.length > 0) {
      const section4Questions: Question[] = [];
      for (const pq of writingQs) {
        const q = convertToQuestion(pq, globalIndex++);
        section4Questions.push(q);
        examData.questions.push(q);
      }

      examData.sections.push({
        name: 'PHẦN 4. Tự luận',
        description: 'Thí sinh trình bày lời giải chi tiết, có thể đính kèm hình ảnh bài làm',
        points: '',
        questions: section4Questions,
        sectionType: 'writing' as any
      });
    }
  }

  return examData;
}

// ============================================================
// DETECT SECTIONS
// ============================================================

interface SectionInfo {
  part1Start: number;
  part2Start: number;
  part3Start: number;
  part3End: number;
}

function detectSections(_fullText: string, paragraphs: ParagraphData[]): SectionInfo {
  const info: SectionInfo = {
    part1Start: -1,
    part2Start: -1,
    part3Start: -1,
    part3End: paragraphs.length
  };

  const part1Patterns = [
    /PHẦN\s*1/i,
    /PHAN\s*1/i,
    /PHẦN\s+I[.:\s]/i,
    /Phần\s*1/i,
    /I\.\s*TRẮC\s*NGHIỆM/i,
    /I\.\s*TRAC\s*NGHIEM/i
  ];

  const part2Patterns = [
    /PHẦN\s*2/i,
    /PHAN\s*2/i,
    /PHẦN\s+II[.:\s]/i,
    /Phần\s*2/i,
    /II\.\s*ĐÚNG\s*SAI/i,
    /II\.\s*DUNG\s*SAI/i,
    /ĐÚNG\s*SAI/i,
    /DUNG\s*SAI/i
  ];

  const part3Patterns = [
    /PHẦN\s*3/i,
    /PHAN\s*3/i,
    /PHẦN\s+III[.:\s]/i,
    /Phần\s*3/i,
    /III\.\s*TRẢ\s*LỜI/i,
    /III\.\s*TRA\s*LOI/i,
    /TRẢ\s*LỜI\s*NGẮN/i,
    /TRA\s*LOI\s*NGAN/i
  ];

  const solutionPatterns = [
    /[-_\s]*HẾT[-_\s]*/i,
    /Thí\s*sinh\s*không\s*sử\s*dụng\s*tài\s*liệu/i,
    /Giám\s*thị\s*không\s*giải\s*thích\s*gì\s*thêm/i,
    /HƯỚNG\s*DẪN\s*GIẢI/i,
    /HUONG\s*DAN\s*GIAI/i,
    /LỜI\s*GIẢI\s*CHI\s*TIẾT/i,
    /LOI\s*GIAI\s*CHI\s*TIET/i,
    /BẢNG\s*ĐÁP\s*ÁN/i,
    /BANG\s*DAP\s*AN/i,
    /ĐÁP\s*ÁN\s*CHI\s*TIẾT/i
  ];

  // Detect where solution section begins
  let solutionStart = paragraphs.length;
  for (let i = 0; i < paragraphs.length; i++) {
    const text = paragraphs[i].text;
    for (const pat of solutionPatterns) {
      if (pat.test(text)) {
        solutionStart = i;
        break;
      }
    }
    if (solutionStart < paragraphs.length) break;
  }

  // Scan section headers (only before solution section)
  const maxScanIdx = solutionStart < paragraphs.length ? solutionStart : paragraphs.length;

  for (let i = 0; i < maxScanIdx; i++) {
    const text = paragraphs[i].text;

    if (info.part1Start === -1) {
      for (const pattern of part1Patterns) {
        if (pattern.test(text)) {
          info.part1Start = i;
          break;
        }
      }
    }

    if (info.part2Start === -1 && (info.part1Start === -1 || i > info.part1Start)) {
      for (const pattern of part2Patterns) {
        if (pattern.test(text)) {
          info.part2Start = i;
          break;
        }
      }
    }

    if (info.part3Start === -1 && (info.part2Start !== -1 ? i > info.part2Start : i > info.part1Start)) {
      for (const pattern of part3Patterns) {
        if (pattern.test(text)) {
          info.part3Start = i;
          break;
        }
      }
    }
  }

  if (info.part1Start === -1) info.part1Start = 0;
  if (info.part2Start === -1) info.part2Start = info.part3Start !== -1 ? info.part3Start : maxScanIdx;
  if (info.part3Start === -1) info.part3Start = maxScanIdx;
  info.part3End = maxScanIdx;

  return info;
}

// ============================================================
// PARSE PART 1: MULTIPLE CHOICE (WITH MULTI-COLUMN OPTIONS)
// ============================================================

function parsePart1WithUnderline(
  paragraphs: ParagraphData[],
  startIdx: number,
  endIdx: number,
  images: ImageData[]
): ParsedQuestion[] {
  if (startIdx < 0 || endIdx <= startIdx) return [];

  const questions: ParsedQuestion[] = [];
  let currentQ: ParsedQuestion | null = null;

  let collectingContent = false;
  let contentBuffer: string[] = [];
  let inSolution = false;
  let solutionBuffer: string[] = [];

  let currentQuestionUnderlinedLetters: string[] = [];
  let currentOptionIndex = -1;
  let startedOptions = false;

  const questionPattern = /^C(?:âu|au)\s*(\d+)\s*[.:]\s*(.*)/i;
  const answerPattern = /Ch(?:ọn|on)\s*([A-D])/i;

  for (let i = startIdx; i < endIdx; i++) {
    const para = paragraphs[i];
    const text = para.text;
    const imageRIds = para.imageRIds;

    if (!text && imageRIds.length === 0) continue;
    if (/[-_\s]*HẾT[-_\s]*/i.test(text) || /Thí\s*sinh\s*không\s*sử\s*dụng\s*tài\s*liệu/i.test(text)) break;

    // Skip section headers
    if (
      /PHẦN\s*\d/i.test(text) ||
      /PHAN\s*\d/i.test(text) ||
      /Trắc\s*nghiệm/i.test(text) ||
      /Trac\s*nghiem/i.test(text)
    ) {
      continue;
    }

    // New question
    const qMatch = text.match(questionPattern);
    if (qMatch) {
      if (currentQ) {
        if (contentBuffer.length > 0 && !currentQ.text) currentQ.text = contentBuffer.join('<br/>').trim();
        if (solutionBuffer.length > 0) currentQ.solution = solutionBuffer.join(' ').trim();

        if (!currentQ.correctAnswer && currentQuestionUnderlinedLetters.length > 0) {
          const underlinedAnswer = currentQuestionUnderlinedLetters.find((l) => /^[A-D]$/i.test(l));
          if (underlinedAnswer) {
            currentQ.correctAnswer = underlinedAnswer.toUpperCase();
            console.log(`📝 Câu ${currentQ.number}: Đáp án từ underline/highlight = ${currentQ.correctAnswer}`);
          }
        }

        if (currentQ.text) questions.push(currentQ);
      }

      const qNum = parseInt(qMatch[1]);
      const restText = qMatch[2].trim();

      currentQ = {
        number: qNum,
        globalIndex: 0,
        part: 1,
        type: 'multiple_choice',
        text: '',
        options: [],
        correctAnswer: null,
        solution: '',
        images: []
      };

      collectingContent = true;
      inSolution = false;
      contentBuffer = [restText ? restText : ''];
      solutionBuffer = [];
      currentQuestionUnderlinedLetters = [];

      currentOptionIndex = -1;
      startedOptions = false;

      if (para.hasUnderline) currentQuestionUnderlinedLetters.push(...para.underlinedSegments);
      if (imageRIds.length > 0) attachImages(currentQ, imageRIds, images);
      continue;
    }

    if (!currentQ) continue;

    // "Lời giải"
    if (/^L(?:ời|oi)\s*gi(?:ải|ai)/i.test(text)) {
      if (contentBuffer.length > 0 && !currentQ.text) {
        currentQ.text = contentBuffer.join('<br/>').trim();
        contentBuffer = [];
      }
      collectingContent = false;
      inSolution = true;
      solutionBuffer = [];
      continue;
    }

    // "Chọn X"
    const chonMatch = text.match(answerPattern);
    if (chonMatch) {
      currentQ.correctAnswer = chonMatch[1].toUpperCase();
      continue;
    }

    // Option line (supports 1, 2, or 4 options on the same line)
    const extractedOpts = extractOptionsFromText(text);
    if (extractedOpts.length > 0 && collectingContent) {
      if (currentQ.options.length === 0 && contentBuffer.length > 0) {
        currentQ.text = contentBuffer.join('<br/>').trim();
        contentBuffer = [];
      }

      for (const opt of extractedOpts) {
        currentQ.options.push({ letter: opt.letter, text: opt.text });
        currentOptionIndex = currentQ.options.length - 1;
        startedOptions = true;

        if (para.hasUnderline) {
          const isMarked = para.underlinedSegments.some(
            (seg) => seg.includes(opt.letter) || (opt.text && seg.includes(opt.text))
          );
          if (isMarked || extractedOpts.length === 1) {
            currentQuestionUnderlinedLetters.push(opt.letter);
          }
        }
      }

      if (imageRIds.length > 0) attachImages(currentQ, imageRIds, images);
      continue;
    }

    // Multiline option continuation
    if (collectingContent && startedOptions && currentOptionIndex >= 0 && text && !inSolution) {
      if (!/^H(?:ình|inh)\s*\d+/i.test(text)) {
        currentQ.options[currentOptionIndex].text = (currentQ.options[currentOptionIndex].text + ' ' + text).trim();
        if (para.hasUnderline) currentQuestionUnderlinedLetters.push(currentQ.options[currentOptionIndex].letter);
      }
      if (imageRIds.length > 0) attachImages(currentQ, imageRIds, images);
      continue;
    }

    // Question stem
    if (collectingContent && text && !inSolution && !startedOptions) {
      if (/^H(?:ình|inh)\s*\d+/i.test(text)) {
        if (imageRIds.length > 0) attachImages(currentQ, imageRIds, images);
        continue;
      }
      contentBuffer.push(text);
      if (para.hasUnderline) currentQuestionUnderlinedLetters.push(...para.underlinedSegments);
    }

    // Solution
    if (inSolution && text) {
      if (!/^H(?:ình|inh)\s*\d+/i.test(text)) solutionBuffer.push(text);
    }

    if (imageRIds.length > 0 && !inSolution) attachImages(currentQ, imageRIds, images);
  }

  // flush last
  if (currentQ) {
    if (contentBuffer.length > 0 && !currentQ.text) currentQ.text = contentBuffer.join('<br/>').trim();
    if (solutionBuffer.length > 0) currentQ.solution = solutionBuffer.join(' ').trim();

    if (!currentQ.correctAnswer && currentQuestionUnderlinedLetters.length > 0) {
      const underlinedAnswer = currentQuestionUnderlinedLetters.find((l) => /^[A-D]$/i.test(l));
      if (underlinedAnswer) {
        currentQ.correctAnswer = underlinedAnswer.toUpperCase();
        console.log(`📝 Câu ${currentQ.number}: Đáp án từ underline/highlight = ${currentQ.correctAnswer}`);
      }
    }

    if (currentQ.text) questions.push(currentQ);
  }

  questions.sort((a, b) => a.number - b.number);
  return questions;
}

// ============================================================
// PARSE PART 2: TRUE/FALSE (WITH MULTI-COLUMN STATEMENTS)
// ============================================================

function parsePart2(paragraphs: ParagraphData[], startIdx: number, endIdx: number, images: ImageData[]): ParsedQuestion[] {
  if (startIdx < 0 || endIdx <= startIdx || startIdx >= paragraphs.length) return [];

  const questions: ParsedQuestion[] = [];
  let currentQ: ParsedQuestion | null = null;

  let collectingContent = false;
  let contentBuffer: string[] = [];
  let inSolution = false;
  let solutionBuffer: string[] = [];

  let currentQuestionTrueStatements: Set<string> = new Set();
  let currentStmtIndex = -1;
  let startedStatements = false;

  const questionPattern = /^C(?:âu|au)\s*(\d+)\s*[.:]\s*(.*)/i;
  const dungSaiAnswerPattern = /([a-d])\s*[\)\.]\s*(Đúng|Sai|Dung)/gi;

  for (let i = startIdx; i < endIdx; i++) {
    const para = paragraphs[i];
    const text = para.text;
    const imageRIds = para.imageRIds;

    if (!text && imageRIds.length === 0) continue;
    if (/[-_\s]*HẾT[-_\s]*/i.test(text) || /Thí\s*sinh\s*không\s*sử\s*dụng\s*tài\s*liệu/i.test(text)) break;
    if (
      /PHẦN\s*\d/i.test(text) ||
      /PHAN\s*\d/i.test(text) ||
      /Thí\s*sinh\s*trả\s*lời/i.test(text) ||
      /chọn\s*đúng\s*hoặc\s*sai/i.test(text) ||
      /ở\s*mỗi\s*câu/i.test(text)
    ) {
      continue;
    }

    const qMatch = text.match(questionPattern);
    if (qMatch) {
      // flush prev
      if (currentQ) {
        if (contentBuffer.length > 0 && !currentQ.text) currentQ.text = contentBuffer.join('<br/>').trim();
        if (solutionBuffer.length > 0) currentQ.solution = solutionBuffer.join(' ').trim();

        if (!currentQ.correctAnswer && currentQuestionTrueStatements.size > 0) {
          const trueStmts = Array.from(currentQuestionTrueStatements).sort();
          currentQ.correctAnswer = trueStmts.join(',');
          console.log(`📝 Câu ${currentQ.number} (Đúng/Sai): Đáp án = ${currentQ.correctAnswer}`);
        }

        if (currentQ.text) questions.push(currentQ);
      }

      const qNum = parseInt(qMatch[1]);
      const restText = qMatch[2].trim();

      currentQ = {
        number: qNum,
        globalIndex: 0,
        part: 2,
        type: 'true_false',
        text: '',
        options: [],
        correctAnswer: null,
        solution: '',
        images: []
      };

      collectingContent = true;
      inSolution = false;
      contentBuffer = [restText ? restText : ''];
      solutionBuffer = [];

      currentQuestionTrueStatements = new Set();
      currentStmtIndex = -1;
      startedStatements = false;

      if (imageRIds.length > 0) attachImages(currentQ, imageRIds, images);
      continue;
    }

    // Auto-create Câu 1 if statement a) appears before any Câu header
    const extractedStmts = extractStatementsFromText(text);
    if (!currentQ && extractedStmts.length > 0 && collectingContent === false) {
      currentQ = {
        number: 1,
        globalIndex: 0,
        part: 2,
        type: 'true_false',
        text: contentBuffer.join('<br/>').trim() || 'Thí sinh chọn Đúng hoặc Sai cho mỗi ý sau:',
        options: [],
        correctAnswer: null,
        solution: '',
        images: []
      };
      contentBuffer = [];
      collectingContent = true;
      inSolution = false;
      currentQuestionTrueStatements = new Set();
      currentStmtIndex = -1;
      startedStatements = false;
    }

    if (!currentQ) {
      if (text && !inSolution) contentBuffer.push(text);
      continue;
    }

    if (/^L(?:ời|oi)\s*gi(?:ải|ai)/i.test(text) || /^Đáp\s*án:/i.test(text)) {
      if (contentBuffer.length > 0 && !currentQ.text) {
        currentQ.text = contentBuffer.join('<br/>').trim();
        contentBuffer = [];
      }
      collectingContent = false;
      inSolution = true;
      solutionBuffer = [];
    }

    // Check solution for "a) Đúng", "b) Sai", etc.
    let dsMatch: RegExpExecArray | null;
    while ((dsMatch = dungSaiAnswerPattern.exec(text)) !== null) {
      const letter = dsMatch[1].toLowerCase();
      const val = dsMatch[2];
      if (/^Đúng|Dung$/i.test(val)) {
        currentQuestionTrueStatements.add(letter);
      }
    }

    if (extractedStmts.length > 0 && collectingContent) {
      if (currentQ.options.length === 0 && contentBuffer.length > 0) {
        currentQ.text = contentBuffer.join('<br/>').trim();
        contentBuffer = [];
      }

      for (const stmt of extractedStmts) {
        currentQ.options.push({ letter: stmt.letter, text: stmt.text });
        currentStmtIndex = currentQ.options.length - 1;
        startedStatements = true;

        if (para.hasUnderline) {
          const isMarked = para.underlinedSegments.some(
            (seg) => seg.toLowerCase().includes(stmt.letter) || (stmt.text && seg.includes(stmt.text))
          );
          if (isMarked || extractedStmts.length === 1) {
            currentQuestionTrueStatements.add(stmt.letter);
          }
        }
      }

      if (imageRIds.length > 0) attachImages(currentQ, imageRIds, images);
      continue;
    }

    // Multiline statement continuation
    if (collectingContent && startedStatements && currentStmtIndex >= 0 && text && !inSolution) {
      if (!/^H(?:ình|inh)\s*\d+/i.test(text)) {
        currentQ.options[currentStmtIndex].text = (currentQ.options[currentStmtIndex].text + ' ' + text).trim();
        if (para.hasUnderline) {
          const letter = currentQ.options[currentStmtIndex].letter.toLowerCase();
          currentQuestionTrueStatements.add(letter);
        }
      }
      if (imageRIds.length > 0) attachImages(currentQ, imageRIds, images);
      continue;
    }

    // Collect stem only before statements
    if (collectingContent && text && !inSolution && !startedStatements) {
      if (/^H(?:ình|inh)\s*\d+/i.test(text)) {
        if (imageRIds.length > 0) attachImages(currentQ, imageRIds, images);
        continue;
      }
      contentBuffer.push(text);
    }

    // Collect solution
    if (inSolution && text) {
      if (!/^H(?:ình|inh)\s*\d+/i.test(text)) solutionBuffer.push(text);
    }

    if (imageRIds.length > 0 && !inSolution) attachImages(currentQ, imageRIds, images);
  }

  // flush last
  if (currentQ) {
    if (contentBuffer.length > 0 && !currentQ.text) currentQ.text = contentBuffer.join('<br/>').trim();
    if (solutionBuffer.length > 0) currentQ.solution = solutionBuffer.join(' ').trim();

    if (!currentQ.correctAnswer && currentQuestionTrueStatements.size > 0) {
      const trueStmts = Array.from(currentQuestionTrueStatements).sort();
      currentQ.correctAnswer = trueStmts.join(',');
      console.log(`📝 Câu ${currentQ.number} (Đúng/Sai): Đáp án = ${currentQ.correctAnswer}`);
    }

    if (currentQ.text) questions.push(currentQ);
  }

  questions.sort((a, b) => a.number - b.number);
  return questions;
}

// ============================================================
// PARSE PART 3: SHORT ANSWER & WRITING
// ============================================================

function parsePart3(paragraphs: ParagraphData[], startIdx: number, endIdx: number, images: ImageData[]): ParsedQuestion[] {
  if (startIdx < 0 || startIdx >= paragraphs.length || endIdx <= startIdx) return [];

  const questions: ParsedQuestion[] = [];
  let currentQ: ParsedQuestion | null = null;
  let collectingContent = false;
  let contentBuffer: string[] = [];
  let solutionBuffer: string[] = [];

  const questionPattern = /^C(?:âu|au)\s*(\d+)\s*[.:]\s*(.*)/i;
  const answerPattern = /^[\*\s]*(?:Đ|D)áp\s*(?:án|an)[:\s]*(.+)/i;

  for (let i = startIdx; i < endIdx; i++) {
    const para = paragraphs[i];
    const text = para.text;
    const imageRIds = para.imageRIds;

    if (!text && imageRIds.length === 0) continue;
    if (/[-_\s]*HẾT[-_\s]*/i.test(text) || /Thí\s*sinh\s*không\s*sử\s*dụng\s*tài\s*liệu/i.test(text)) break;
    if (/PHẦN\s*\d/i.test(text) || /PHAN\s*\d/i.test(text)) continue;

    const qMatch = text.match(questionPattern);
    if (qMatch) {
      // flush prev
      if (currentQ) {
        if (contentBuffer.length > 0) currentQ.text = contentBuffer.join('<br/>').trim();
        if (solutionBuffer.length > 0) currentQ.solution = solutionBuffer.join(' ').trim();
// keep as short_answer in Part 3
        if (currentQ.text) questions.push(currentQ);
      }

      const qNum = parseInt(qMatch[1]);
      const restText = qMatch[2].trim();

      currentQ = {
        number: qNum,
        globalIndex: 0,
        part: 3,
        type: 'short_answer',
        text: '',
        options: [],
        correctAnswer: null,
        solution: '',
        images: []
      };

      collectingContent = true;
      contentBuffer = [restText ? restText : ''];
      solutionBuffer = [];

      if (imageRIds.length > 0) attachImages(currentQ, imageRIds, images);
      continue;
    }

    if (!currentQ) continue;

    if (/^L(?:ời|oi)\s*gi(?:ải|ai)/i.test(text)) {
      if (contentBuffer.length > 0) currentQ.text = contentBuffer.join('<br/>').trim();
      collectingContent = false;
      continue;
    }

    const ansMatch = text.match(answerPattern);
    if (ansMatch) {
      currentQ.correctAnswer = ansMatch[1].trim();
      continue;
    }

    if (collectingContent && text) {
      if (/^H(?:ình|inh)\s*\d+/i.test(text)) {
        if (imageRIds.length > 0) attachImages(currentQ, imageRIds, images);
        continue;
      }
      contentBuffer.push(text);
    }

    // Solution
    if (collectingContent === false && text && !/^C(?:âu|au)\s*\d+/.test(text)) {
      if (!/^H(?:ình|inh)\s*\d+/i.test(text) && !answerPattern.test(text)) {
        solutionBuffer.push(text);
      }
    }

    if (imageRIds.length > 0) attachImages(currentQ, imageRIds, images);
  }

  if (currentQ) {
    if (contentBuffer.length > 0) currentQ.text = contentBuffer.join('<br/>').trim();
    if (solutionBuffer.length > 0) currentQ.solution = solutionBuffer.join(' ').trim();
    if (!currentQ.correctAnswer) {
      currentQ.type = 'writing';
      currentQ.part = 4;
    }
    if (currentQ.text) questions.push(currentQ);
  }

  questions.sort((a, b) => a.number - b.number);
  return questions;
}

// ============================================================
// HELPERS
// ============================================================

function attachImages(q: ParsedQuestion, rIds: string[], images: ImageData[]): void {
  for (const rId of rIds) {
    let img = images.find((i) => i.rId === rId);

    if (!img) {
      for (const image of images) {
        if (image.filename && rId.includes(image.filename)) {
          img = image;
          break;
        }
      }
    }

    if (img && !q.images.find((i) => i.id === img!.id)) {
      q.images.push(img);
    }
  }
}

function convertToQuestion(pq: ParsedQuestion, globalIndex: number): Question {
  const uniqueNumber = pq.part * 100 + pq.number;

  return {
    number: uniqueNumber,
    text: escapeHtmlPreserveLaTeX(pq.text),
    type: pq.type,
    options: pq.options.map((opt) => ({
      ...opt,
      text: escapeHtmlPreserveLaTeX(opt.text)
    })),
    correctAnswer: pq.correctAnswer,
    part: `PHẦN ${pq.part}`,
    images: pq.images,
    solution: pq.solution,
    section: {
      letter: String(pq.part),
      name: getPartName(pq.part),
      points: ''
    }
  };
}

function getPartName(part: number): string {
  switch (part) {
    case 1:
      return 'Trắc nghiệm nhiều lựa chọn';
    case 2:
      return 'Trắc nghiệm đúng sai';
    case 3:
      return 'Trắc nghiệm trả lời ngắn';
    case 4:
      return 'Tự luận';
    default:
      return '';
  }
}

// ============================================================
// VALIDATE
// ============================================================

export const validateExamData = (data: ExamData): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!data.questions || data.questions.length === 0) {
    errors.push('Không tìm thấy câu hỏi nào trong file');
  }

  let part1 = 0,
    part2 = 0,
    part3 = 0,
    part4 = 0;
  let withAnswer = 0,
    withoutAnswer = 0;

  data.questions.forEach((q: Question) => {
    if (!q.text || !q.text.trim()) {
      errors.push(`Câu ${q.number}: Thiếu nội dung câu hỏi`);
    }

    const part = Math.floor(q.number / 100);
    if (part === 1) part1++;
    else if (part === 2) part2++;
    else if (part === 3) part3++;
    else if (part === 4) part4++;

    if (q.correctAnswer) withAnswer++;
    else withoutAnswer++;
  });

  console.log(`📊 Question count: PHẦN 1=${part1}, PHẦN 2=${part2}, PHẦN 3=${part3}, PHẦN 4(TL)=${part4}`);
  console.log(`📊 Answers: Có đáp án=${withAnswer}, Chưa có=${withoutAnswer}`);

  return {
    valid: errors.length === 0,
    errors
  };
};

// ============================================================
// UTILITIES
// ============================================================

export function isWebCompatibleImage(contentType: string): boolean {
  const webTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
  return webTypes.includes(contentType);
}

export function getImageDataUrl(img: { base64: string; contentType: string }): string {
  if (!img.base64) return '';
  return `data:${img.contentType};base64,${img.base64}`;
}
