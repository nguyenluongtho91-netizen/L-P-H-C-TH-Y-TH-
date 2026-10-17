import { ExamData, Question, QuestionOption } from '../types';
import { compileExamTikz } from './compiletikz';

type QuestionType = 'multiple_choice' | 'true_false' | 'short_answer' | 'writing' | 'unknown';

// ✅ Định nghĩa lại kiểu ImageData để có base64 cho TikZ
export interface ExtendedImageData {
  id: string;
  filename: string;
  base64?: string;
  contentType?: string;
}

interface ParsedQuestion {
  number: number;
  part: number;
  type: QuestionType;
  text: string;
  options: QuestionOption[];
  correctAnswer: string | null;
  solution: string;
  images: ExtendedImageData[];
}

// ============================================================
// MAIN EXPORT
// ============================================================

export const parseTexToExam = async (
  file: File,
  onProgress?: (message: string) => void
): Promise<ExamData> => {
  const log = (msg: string) => { console.log(msg); onProgress?.(msg); };

  log('📄 Đang đọc file LaTeX...');
  const content = await file.text();

  log('🔍 Đang tìm hình TikZ...');
  const { processedContent, images } = await extractAndCompileTikZ(content, log);

  log('🔍 Đang phân tích câu hỏi...');
  const sectionInfo = detectSections(processedContent);

  const part1Questions = parsePart1(processedContent, sectionInfo.part1Start, sectionInfo.part2Start, images);
  const part2Questions = parsePart2(processedContent, sectionInfo.part2Start, sectionInfo.part3Start, images);
  const part3Questions = parsePart3(processedContent, sectionInfo.part3Start, sectionInfo.part4Start, images);
  const part4Questions = parsePart4(processedContent, sectionInfo.part4Start, processedContent.length, images);

  const total = part1Questions.length + part2Questions.length + part3Questions.length + part4Questions.length;
  log(`✅ Phân tích xong: ${total} câu hỏi`);

  const examData: ExamData = {
    title: file.name.replace('.tex', ''),
    subject: 'math',
    timeLimit: 90,
    sections: [],
    questions: [],
    answers: {},
    images: images as any, // Ép kiểu để tương thích với ExamData gốc
  };

  const addSection = (
    pqs: ParsedQuestion[],
    sectionName: string,
    sectionDesc: string,
    sectionType: QuestionType
  ) => {
    if (pqs.length === 0) return;
    const sectionQuestions: Question[] = [];
    for (const pq of pqs) {
      // ✅ Đã bỏ globalIndex bị thừa
      const q = convertToQuestion(pq);
      sectionQuestions.push(q);
      examData.questions.push(q);
      if (q.correctAnswer) examData.answers[q.number] = q.correctAnswer;
    }
    examData.sections.push({
      name: sectionName,
      description: sectionDesc,
      points: 0, // ✅ Sửa thành số thay vì chuỗi rỗng
      questions: sectionQuestions,
      sectionType,
    });
  };

  addSection(part1Questions, 'PHẦN 1. Trắc nghiệm nhiều lựa chọn', 'Chọn một phương án đúng A, B, C hoặc D', 'multiple_choice');
  addSection(part2Questions, 'PHẦN 2. Trắc nghiệm đúng sai', 'Chọn Đúng hoặc Sai cho mỗi mệnh đề', 'true_false');
  addSection(part3Questions, 'PHẦN 3. Trả lời ngắn', 'Điền đáp án số vào ô trống', 'short_answer');
  addSection(part4Questions, 'PHẦN 4. Tự luận', 'Học sinh trình bày lời giải chi tiết', 'writing');

  // FALLBACK DÀNH CHO FILE LATEX THƯỜNG (SOẠN BẰNG \textbf{Ví dụ 1.} / \textbf{Câu 1.} KHÔNG CÓ \begin{ex})
  if (examData.questions.length === 0) {
    log('⚡ Không có thẻ \begin{ex}, đang quét câu hỏi theo tiêu đề in đậm (Ví dụ, Câu, Bài)...');
    const fallbackQuestions = parseTexFallback(processedContent, images);
    if (fallbackQuestions.length > 0) {
      addSection(fallbackQuestions, 'PHẦN 4. Tự luận & Ví dụ bài tập', 'Học sinh trình bày lời giải chi tiết', 'writing');
      log(`✅ Phân tích xong (Fallback tiêu đề): ${fallbackQuestions.length} câu hỏi`);
    }
  }

  return examData;
};

// ============================================================
// TIKZ EXTRACTION AND COMPILATION
// ============================================================

async function extractAndCompileTikZ(
  content: string,
  log: (msg: string) => void
): Promise<{ processedContent: string; images: ExtendedImageData[] }> {
  const images: ExtendedImageData[] = [];
  let processedContent = content;

  const tikzRegex = /\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g;
  const tikzMatches = content.match(tikzRegex) || [];

  if (tikzMatches.length === 0) {
    log('ℹ️ Không tìm thấy hình TikZ');
    return { processedContent, images };
  }

  log(`🎨 Tìm thấy ${tikzMatches.length} hình TikZ, đang biên dịch...`);

  for (let i = 0; i < tikzMatches.length; i++) {
    const tikzCode = tikzMatches[i];
    log(`  ⏳ Compile hình ${i + 1}/${tikzMatches.length}...`);

    try {
      const result = await compileExamTikz(tikzCode, {
        format: 'png',
        density: 300,
        transparent: true,
        returnLog: true,
      });

      if (result.ok && result.base64) {
        const imageId = `tikz_${i}`;
        images.push({
          id: imageId,
          filename: `tikz_${i}.png`,
          base64: result.base64,
          contentType: 'image/png',
        });
        processedContent = processedContent.replace(tikzCode, `[TIKZ_IMAGE:${imageId}]`);
        log(`  ✅ Hình ${i + 1} thành công`);
      } else {
        const err = result.detail || 'Không rõ lỗi';
        log(`  ⚠️ Hình ${i + 1} lỗi: ${err}`);
        processedContent = processedContent.replace(tikzCode, `[HÌNH ${i + 1} - Lỗi compile]`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log(`  ❌ Hình ${i + 1}: ${msg}`);
      processedContent = processedContent.replace(tikzCode, `[HÌNH ${i + 1} - Lỗi]`);
    }
  }

  return { processedContent, images };
}

function inlineTikzAsHtml(text: string, images: ExtendedImageData[]): string {
  return text.replace(/\[TIKZ_IMAGE:([^\]]+)\]/g, (_, imageId) => {
    const img = images.find(i => i.id === imageId);
    if (!img?.base64) return '';
    const src = img.base64.startsWith('data:')
      ? img.base64
      : `data:${img.contentType || 'image/png'};base64,${img.base64}`;
    return `<div style="text-align:center;margin:10px 0"><img src="${src}" alt="Hình" style="max-width:100%;max-height:400px;height:auto;border-radius:4px;" /></div>`;
  });
}

function stripAllPlaceholders(text: string): string {
  return text
    .replace(/\[TIKZ_IMAGE:[^\]]+\]/g, '')
    .replace(/\[HÌNH[^\]]*\]/g, '')
    .trim();
}

function stripMetaCommands(text: string): string {
  return text
    .replace(/\\allowdisplaybreaks\b/g, '')
    .replace(/\\newpage\b/g, '')
    .replace(/\\clearpage\b/g, '')
    .replace(/\\noindent\b/g, '')
    .replace(/\\medskip\b/g, '')
    .replace(/\\bigskip\b/g, '')
    .replace(/\\smallskip\b/g, '')
    .replace(/\\vspace\s*\{[^}]*\}/g, '')
    .replace(/\\hspace\s*\{[^}]*\}/g, ' ')
    .replace(/\\phantom\s*\{[^}]*\}/g, '')
    .replace(/\\label\s*\{[^}]*\}/g, '')
    .replace(/\\ref\s*\{[^}]*\}/g, '')
    .replace(/\\pagebreak\b/g, '')
    .replace(/\\linebreak\b/g, '')
    .replace(/\\displaystyle\b/g, '\\displaystyle ') 
    .replace(/\\mathrm\b/g, '\\mathrm')              
    ;
}

function expandImmini(content: string): string {
  let result = content;
  let searchFrom = 0;

  while (true) {
    const idx = result.indexOf('\\immini', searchFrom);
    if (idx === -1) break;

    const afterCmd = idx + '\\immini'.length;
    const arg1 = readBraceGroup(result, afterCmd);
    if (!arg1) { searchFrom = idx + 1; continue; }

    const arg2 = readBraceGroup(result, arg1.nextIndex);
    if (!arg2) { searchFrom = idx + 1; continue; }

    const mainContent = arg1.group;
    const sideContent = arg2.group;

    const choiceMatch = mainContent.search(/\\choice(?:TF)?\b|\\shortans\b/);
    let merged: string;
    if (choiceMatch !== -1) {
      merged = mainContent.substring(0, choiceMatch)
        + '\n\n' + sideContent + '\n\n'
        + mainContent.substring(choiceMatch);
    } else {
      merged = mainContent + '\n\n' + sideContent;
    }

    result = result.substring(0, idx) + merged + result.substring(arg2.nextIndex);
    searchFrom = idx + merged.length;
  }

  return result;
}

function splitMathNonMath(text: string): Array<{ content: string; isMath: boolean }> {
  const segments: Array<{ content: string; isMath: boolean }> = [];
  const MATH_RE = /(\$\$[\s\S]*?\$\$|\$(?:[^$\\]|\\.)*?\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\\begin\{(?:align\*?|eqnarray\*?|gather\*?|multline\*?|equation\*?|cases|split|array|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|aligned)\}[\s\S]*?\\end\{(?:align\*?|eqnarray\*?|gather\*?|multline\*?|equation\*?|cases|split|array|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|aligned)\})/gs;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = MATH_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ content: text.slice(lastIndex, match.index), isMath: false });
    }
    segments.push({ content: match[0], isMath: true });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ content: text.slice(lastIndex), isMath: false });
  }

  return segments;
}

function transformNonMath(text: string, fn: (t: string) => string): string {
  return splitMathNonMath(text)
    .map(seg => seg.isMath ? seg.content : fn(seg.content))
    .join('');
}

function preProcessEquationCommands(text: string): string {
  const segments = splitMathNonMath(text);

  return segments.map(seg => {
    let t = seg.content;
    const isInsideMath = seg.isMath;

    const replacements: [string, (inner: string) => string][] = [
      ['\\heva', (inner: string) => {
        const clean = inner.replace(/^\s*&\s*/gm, '').replace(/&/g, '');
        return isInsideMath
          ? `\\begin{cases}${clean}\\end{cases}`
          : `\\[\\begin{cases}${clean}\\end{cases}\\]`;
      }],
      ['\\hoac', (inner: string) => {
        const clean = inner.replace(/^\s*&\s*/gm, '').replace(/&/g, '');
        return isInsideMath
          ? `\\left[\\begin{array}{l}${clean}\\end{array}\\right.`
          : `\\[\\left[\\begin{array}{l}${clean}\\end{array}\\right.\\]`;
      }],
    ];

    for (const [cmd, buildResult] of replacements) {
      let out = '';
      let i = 0;
      while (i < t.length) {
        const idx = t.indexOf(cmd, i);
        if (idx === -1) { out += t.slice(i); break; }
        out += t.slice(i, idx);
        const afterCmd = idx + cmd.length;

        let j = afterCmd;
        while (j < t.length && /[ \t\n]/.test(t[j])) j++;

        if (j >= t.length || t[j] !== '{') {
          out += cmd;
          i = afterCmd;
          continue;
        }

        const parsed = readBraceGroup(t, j);
        if (!parsed) {
          out += cmd;
          i = afterCmd;
          continue;
        }

        out += buildResult(parsed.group);
        i = parsed.nextIndex;
      }
      t = out;
    }

    return t;
  }).join('');
}

function convertTabularToHtml(text: string): string {
  const tabularRegex = /\\begin\{tabular\}\s*\{([^}]+)\}([\s\S]*?)\\end\{tabular\}/g;

  return text.replace(tabularRegex, (_match, _colSpec: string, body: string) => {
    try {
      const rows = body.split(/\\\\/).map((r: string) => r.trim()).filter(Boolean);
      if (rows.length === 0) return _match;

      let html = '<table style="border-collapse:collapse;margin:8px auto;border:1px solid #555;">';

      rows.forEach((row: string, rowIdx: number) => {
        const cleanRow = row.replace(/\\hline/g, '').trim();
        if (!cleanRow) return;

        const cells = cleanRow.split('&').map((c: string) => c.trim());
        html += '<tr>';
        cells.forEach((cell: string) => {
          const tag = rowIdx === 0 ? 'th' : 'td';
          const baseStyle = 'padding:5px 12px;text-align:center;border:1px solid #555;';
          const extraStyle = rowIdx === 0 ? 'background:#f0f0f0;font-weight:bold;' : '';
          html += `<${tag} style="${baseStyle}${extraStyle}">${cell}</${tag}>`;
        });
        html += '</tr>';
      });

      html += '</table>';
      return html;
    } catch {
      return _match;
    }
  });
}

function convertListsToHtml(text: string): string {
  text = text.replace(
    /\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g,
    (_, body: string) => {
      const items = body.split(/\\item\b/).filter((s: string) => s.trim());
      if (items.length === 0) return '';
      return (
        '<ul style="padding-left:1.5em;margin:6px 0">' +
        items.map((s: string) => `<li style="margin-bottom:4px">${s.trim()}</li>`).join('') +
        '</ul>'
      );
    }
  );

  text = text.replace(
    /\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g,
    (_, body: string) => {
      const items = body.split(/\\item\b/).filter((s: string) => s.trim());
      if (items.length === 0) return '';
      return (
        '<ol style="padding-left:1.5em;margin:6px 0">' +
        items.map((s: string) => `<li style="margin-bottom:4px">${s.trim()}</li>`).join('') +
        '</ol>'
      );
    }
  );

  text = text.replace(
    /\\begin\{description\}([\s\S]*?)\\end\{description\}/g,
    (_, body: string) => {
      const items = body.split(/\\item\b/).filter((s: string) => s.trim());
      if (items.length === 0) return '';
      return (
        '<dl style="padding-left:1em;margin:6px 0">' +
        items.map((s: string) => `<dd style="margin-bottom:4px">${s.trim()}</dd>`).join('') +
        '</dl>'
      );
    }
  );

  return text;
}

function processLatexText(text: string): string {
  if (!text) return '';
  text = stripMetaCommands(text);
  text = preProcessEquationCommands(text);
  text = transformNonMath(text, t => t.replace(/%[^\n]*/g, ''));
  text = convertTabularToHtml(text);
  text = convertListsToHtml(text);
  text = transformNonMath(text, t => {
    t = t.replace(/\\begin\{center\}/g, '<div style="text-align:center">');
    t = t.replace(/\\end\{center\}/g, '</div>');
    t = t.replace(/\\begin\{flushleft\}/g, '<div style="text-align:left">');
    t = t.replace(/\\end\{flushleft\}/g, '</div>');
    t = t.replace(/\\begin\{flushright\}/g, '<div style="text-align:right">');
    t = t.replace(/\\end\{flushright\}/g, '</div>');
    t = t.replace(/\\textbf\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '<strong>$1</strong>');
    t = t.replace(/\\textit\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '<em>$1</em>');
    t = t.replace(/\\underline\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '<u>$1</u>');
    t = t.replace(/\{\\bf\s+([^}]+)\}/g, '<strong>$1</strong>');
    t = t.replace(/\{\\it\s+([^}]+)\}/g, '<em>$1</em>');
    t = t.replace(/\\\\/g, '<br/>');
    t = t.replace(/(?<!\\)~/g, '\u00a0');
    t = t.replace(/\r?\n[ \t]*/g, ' ');
    return t;
  });

  return text.replace(/[ \t]{2,}/g, ' ').trim();
}

function processLatexSolution(text: string, images: ExtendedImageData[]): string {
  if (!text) return '';
  text = stripMetaCommands(text);
  text = preProcessEquationCommands(text);
  text = text.replace(/%[^\n]*/g, '');
  text = inlineTikzAsHtml(text, images);
  text = convertTabularToHtml(text);
  text = convertListsToHtml(text);
  text = text.replace(/\\begin\{itemchoice\}/g, '<ol class="solution-list" style="padding-left:1.2em;margin:8px 0">');
  text = text.replace(/\\end\{itemchoice\}/g, '</ol>');
  text = text.replace(/\\itemch\s*/g, '<li style="margin-bottom:6px">');
  text = text.replace(/\\begin\{center\}/g, '<div style="text-align:center">');
  text = text.replace(/\\end\{center\}/g, '</div>');
  text = text.replace(/\\begin\{flushleft\}/g, '<div style="text-align:left">');
  text = text.replace(/\\end\{flushleft\}/g, '</div>');
  text = text.replace(/\\begin\{flushright\}/g, '<div style="text-align:right">');
  text = text.replace(/\\end\{flushright\}/g, '</div>');
  text = text.replace(/\\textbf\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '<strong>$1</strong>');
  text = text.replace(/\\textit\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '<em>$1</em>');
  text = text.replace(/\\underline\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '<u>$1</u>');
  text = text.replace(/\{\\bf\s+([^}]+)\}/g, '<strong>$1</strong>');
  text = text.replace(/\{\\it\s+([^}]+)\}/g, '<em>$1</em>');
  text = transformNonMath(text, t => {
    t = t.replace(/\\\\/g, '<br/>');
    t = t.replace(/(?<!\\)~/g, '\u00a0');
    t = t.replace(/\r?\n[ \t]*/g, ' ');
    return t;
  });
  return text.replace(/[ \t]{2,}/g, ' ').trim();
}

interface SectionInfo {
  part1Start: number;
  part2Start: number;
  part3Start: number;
  part4Start: number;
}

function detectSections(content: string): SectionInfo {
  const info: SectionInfo = { part1Start: 0, part2Start: content.length, part3Start: content.length, part4Start: content.length };

  const part1Match = content.match(/\\textbf\{PHẦN\s*1[.\s]/i) || content.match(/PHẦN\s*1[.\s]/i) || content.match(/Phần\s*I[.\s]/i);
  if (part1Match?.index !== undefined) info.part1Start = part1Match.index;

  const part2Match = content.match(/\\textbf\{PHẦN\s*2[.\s]/i) || content.match(/PHẦN\s*2[.\s]/i) || content.match(/Phần\s*II[.\s]/i);
  if (part2Match?.index !== undefined) info.part2Start = part2Match.index;

  const part3Match = content.match(/\\textbf\{PHẦN\s*3[.\s]/i) || content.match(/PHẦN\s*3[.\s]/i) || content.match(/Phần\s*III[.\s]/i);
  if (part3Match?.index !== undefined) info.part3Start = part3Match.index;

  const part4Match = content.match(/\\textbf\{PHẦN\s*4[.\s]/i) || content.match(/PHẦN\s*4[.\s]/i) || content.match(/Phần\s*IV[.\s]/i) || content.match(/TỰ\s*LUẬN/i);
  if (part4Match?.index !== undefined) info.part4Start = part4Match.index;

  return info;
}

function parsePart1(content: string, start: number, end: number, images: ExtendedImageData[]): ParsedQuestion[] {
  if (start >= end) return [];
  const partContent = content.substring(start, end);
  const questions: ParsedQuestion[] = [];
  const exRegex = /\\begin\{ex\}([\s\S]*?)\\end\{ex\}/g;
  let match;
  let num = 1;

  while ((match = exRegex.exec(partContent)) !== null) {
    const exContent = match[1];
    if (!exContent.includes('\\choice') || exContent.includes('\\choiceTF')) continue;
    const q = parseMultipleChoiceQuestion(exContent, num, images);
    if (q) { questions.push(q); num++; }
  }
  return questions;
}

function parseMultipleChoiceQuestion(rawContent: string, num: number, images: ExtendedImageData[]): ParsedQuestion | null {
  const content = expandImmini(rawContent);
  const sol = extractCommandGroup(content, '\\loigiai');
  const contentNoSol = sol.cleaned;
  const solution = sol.group ? processLatexSolution(sol.group, images) : '';

  const choiceIndex = contentNoSol.search(/\\choice(?!TF)/);
  if (choiceIndex === -1) return null;

  const questionRaw = contentNoSol.substring(0, choiceIndex).trim();
  const questionText = inlineTikzAsHtml(processLatexText(questionRaw), images);

  const choicesContent = contentNoSol.substring(choiceIndex);
  const groups = parseBraceGroupsAfterCommand(choicesContent, '\\choice', 4);
  const letters = ['A', 'B', 'C', 'D'];
  const options: QuestionOption[] = [];
  let correctAnswer: string | null = null;

  for (let i = 0; i < groups.length && i < 4; i++) {
    let choiceText = groups[i].trim();
    const isCorrect = /\\True/.test(choiceText);
    if (isCorrect) {
      choiceText = choiceText.replace(/\\True\s*/g, '').trim();
      correctAnswer = letters[i];
    }
    options.push({
      letter: letters[i],
      text: inlineTikzAsHtml(processLatexText(stripAllPlaceholders(choiceText)), images),
      isCorrect,
    });
  }

  return {
    number: num,
    part: 1,
    type: 'multiple_choice',
    text: questionText,
    options,
    correctAnswer,
    solution,
    images: [],
  };
}

function parsePart2(content: string, start: number, end: number, images: ExtendedImageData[]): ParsedQuestion[] {
  if (start >= end) return [];
  const partContent = content.substring(start, end);
  const questions: ParsedQuestion[] = [];
  const exRegex = /\\begin\{ex\}([\s\S]*?)\\end\{ex\}/g;
  let match;
  let num = 1;

  while ((match = exRegex.exec(partContent)) !== null) {
    const exContent = match[1];
    if (!exContent.includes('\\choiceTF')) continue;
    const q = parseTrueFalseQuestion(exContent, num, images);
    if (q) { questions.push(q); num++; }
  }
  return questions;
}

function parseTrueFalseQuestion(rawContent: string, num: number, images: ExtendedImageData[]): ParsedQuestion | null {
  const content = expandImmini(rawContent);
  const sol = extractCommandGroup(content, '\\loigiai');
  const contentNoSol = sol.cleaned;
  const solution = sol.group ? processLatexSolution(sol.group, images) : '';

  const choiceIndex = contentNoSol.indexOf('\\choiceTF');
  if (choiceIndex === -1) return null;

  const questionRaw = contentNoSol.substring(0, choiceIndex).trim();
  const questionText = inlineTikzAsHtml(processLatexText(questionRaw), images);

  const choicesContent = contentNoSol.substring(choiceIndex);
  const groups = parseBraceGroupsAfterCommand(choicesContent, '\\choiceTF', 4);
  const letters = ['a', 'b', 'c', 'd'];
  const options: QuestionOption[] = [];
  const correctStatements: string[] = [];

  for (let i = 0; i < groups.length && i < 4; i++) {
    let choiceText = groups[i].trim();
    const isTrue = /\\True/.test(choiceText);
    if (isTrue) {
      choiceText = choiceText.replace(/\\True\s*/g, '').trim();
      correctStatements.push(letters[i]);
    }
    options.push({
      letter: letters[i],
      text: inlineTikzAsHtml(processLatexText(stripAllPlaceholders(choiceText)), images),
      isCorrect: isTrue,
    });
  }

  return {
    number: num,
    part: 2,
    type: 'true_false',
    text: questionText,
    options,
    correctAnswer: correctStatements.join(','),
    solution,
    images: [],
  };
}

function parsePart3(content: string, start: number, end: number, images: ExtendedImageData[]): ParsedQuestion[] {
  if (start >= end) return [];
  const partContent = content.substring(start, end);
  const questions: ParsedQuestion[] = [];
  const exRegex = /\\begin\{ex\}([\s\S]*?)\\end\{ex\}/g;
  let match;
  let num = 1;

  while ((match = exRegex.exec(partContent)) !== null) {
    const exContent = match[1];
    if (!exContent.includes('\\shortans')) continue;
    const q = parseShortAnswerQuestion(exContent, num, images);
    if (q) { questions.push(q); num++; }
  }
  return questions;
}

function parseShortAnswerQuestion(rawContent: string, num: number, images: ExtendedImageData[]): ParsedQuestion | null {
  const content = expandImmini(rawContent);
  const sol = extractCommandGroup(content, '\\loigiai');
  let contentNoSol = sol.cleaned;
  const solution = sol.group ? processLatexSolution(sol.group, images) : '';

  const ans = extractCommandGroup(contentNoSol, '\\shortans');
  contentNoSol = ans.cleaned;
  const correctAnswer = ans.group ? ans.group.trim() : null;

  const questionRaw = contentNoSol.trim();
  const questionText = inlineTikzAsHtml(processLatexText(questionRaw), images);

  return {
    number: num,
    part: 3,
    type: 'short_answer',
    text: questionText,
    options: [],
    correctAnswer,
    solution,
    images: [],
  };
}

function parsePart4(content: string, start: number, end: number, images: ExtendedImageData[]): ParsedQuestion[] {
  if (start >= end) return [];
  const partContent = content.substring(start, end);
  const questions: ParsedQuestion[] = [];
  const exRegex = /\\begin\{ex\}([\s\S]*?)\\end\{ex\}/g;
  let match;
  let num = 1;

  while ((match = exRegex.exec(partContent)) !== null) {
    const exContent = match[1];
    if (exContent.includes('\\choice') || exContent.includes('\\choiceTF') || exContent.includes('\\shortans')) continue;
    const q = parseWritingQuestion(exContent, num, images);
    if (q) { questions.push(q); num++; }
  }
  return questions;
}

function parseWritingQuestion(rawContent: string, num: number, images: ExtendedImageData[]): ParsedQuestion | null {
  const content = expandImmini(rawContent);
  const sol = extractCommandGroup(content, '\\loigiai');
  const contentNoSol = sol.cleaned;
  const solution = sol.group ? processLatexSolution(sol.group, images) : '';

  const questionRaw = contentNoSol.trim();
  const questionText = inlineTikzAsHtml(processLatexText(questionRaw), images);

  return {
    number: num,
    part: 4,
    type: 'writing',
    text: questionText,
    options: [],
    correctAnswer: null,
    solution,
    images: [],
  };
}

function skipSpaces(s: string, i: number): number {
  while (i < s.length && /\s/.test(s[i])) i++;
  return i;
}

function readBraceGroup(s: string, startIndex: number): { group: string; nextIndex: number } | null {
  let i = skipSpaces(s, startIndex);
  if (i >= s.length || s[i] !== '{') return null;

  i++;
  let depth = 1;
  const start = i;

  while (i < s.length) {
    const ch = s[i];
    if (ch === '\\') { i += 2; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
    if (depth === 0) {
      return { group: s.substring(start, i - 1), nextIndex: i };
    }
  }
  return null;
}

function extractCommandGroup(input: string, command: string): { group: string | null; cleaned: string } {
  const idx = input.indexOf(command);
  if (idx === -1) return { group: null, cleaned: input };

  const braceStart = input.indexOf('{', idx + command.length);
  if (braceStart === -1) return { group: null, cleaned: input };

  const parsed = readBraceGroup(input, braceStart);
  if (!parsed) return { group: null, cleaned: input };

  return {
    group: parsed.group,
    cleaned: input.substring(0, idx) + input.substring(parsed.nextIndex),
  };
}

function parseBraceGroupsAfterCommand(input: string, command: string, maxGroups: number): string[] {
  const cmdRegex = new RegExp(command.replace(/\\/g, '\\\\') + '(?:\\[[^\\]]*\\])?');
  const cmdMatch = input.match(cmdRegex);
  if (!cmdMatch || cmdMatch.index === undefined) return [];

  let i = cmdMatch.index + cmdMatch[0].length;
  const groups: string[] = [];

  for (let k = 0; k < maxGroups; k++) {
    i = skipSpaces(input, i);
    const bracePos = input.indexOf('{', i);
    if (bracePos === -1 || bracePos > i + 5) break; 
    const parsed = readBraceGroup(input, bracePos);
    if (!parsed) break;
    groups.push(parsed.group);
    i = parsed.nextIndex;
  }

  return groups;
}

// ✅ Sửa hàm convert: Bỏ đi biến globalIndex bị dư thừa và cập nhật điểm mặc định là 0
function convertToQuestion(pq: ParsedQuestion): Question {
  const uniqueNumber = pq.part * 100 + pq.number;
  return {
    number: uniqueNumber,
    text: pq.text,
    type: pq.type,
    options: pq.options,
    correctAnswer: pq.correctAnswer,
    part: pq.part, // ✅ Đã sửa về đúng kiểu số (number)
    images: pq.images as any,
    solution: pq.solution,
    section: {
      letter: String(pq.part),
      name: getPartName(pq.part),
      points: 0, 
    },
  };
}

function getPartName(part: number): string {
  switch (part) {
    case 1: return 'Trắc nghiệm nhiều lựa chọn';
    case 2: return 'Trắc nghiệm đúng sai';
    case 3: return 'Trả lời ngắn';
    case 4: return 'Tự luận';
    default: return '';
  }
}


function parseTexFallback(content: string, images: ExtendedImageData[]): ParsedQuestion[] {
  const docMatch = content.match(/\\begin\{document\}([\s\S]*?)(?:\\end\{document\}|$)/i);
  const body = docMatch ? docMatch[1] : content;

  // Pattern nhận diện các khối câu hỏi theo định dạng in đậm:
  // \textbf{Ví dụ 1.} / \textbf{Ví dụ 1.1.} / \textbf{Câu 1.} / \textbf{Bài 1.} / \textbf{VD 1.}
  const pattern = /\\textbf\{\s*(?:C(?:âu|au)|V(?:í\s*dụ|i\s*du)|VD|B(?:ài|ai)|D(?:ạng|ang))\s*([\d.]+)[.:]?\s*\}/gi;

  const matches: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(body)) !== null) {
    matches.push(m);
  }

  if (matches.length === 0) return [];

  const questions: ParsedQuestion[] = [];

  for (let i = 0; i < matches.length; i++) {
    const curMatch = matches[i];
    const rawHeader = curMatch[0];
    const labelText = rawHeader.replace(/\\textbf\{|\}/g, '').trim();
    const start = curMatch.index + curMatch[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : body.length;
    let block = body.substring(start, end).trim();

    // Tách lời giải nếu có \loigiai{...}
    const sol = extractCommandGroup(block, '\\loigiai');
    let contentNoSol = sol.cleaned;
    let solution = sol.group ? processLatexSolution(sol.group, images) : '';

    // Hoặc nếu có \textbf{Lời giải} / \textbf{Đáp án}
    const inlineSolMatch = contentNoSol.match(/\\textbf\{(?:L(?:ời|oi)\s*gi(?:ải|ai)|Đáp\s*án)[^}]*\}([\s\S]*)$/i);
    if (inlineSolMatch && inlineSolMatch.index !== undefined) {
      solution = processLatexSolution(inlineSolMatch[1], images);
      contentNoSol = contentNoSol.substring(0, inlineSolMatch.index).trim();
    }

    // Xử lý TikZ và định dạng LaTeX
    const processedText = inlineTikzAsHtml(processLatexText(contentNoSol), images);
    const fullQuestionHtml = `<strong>${labelText}</strong> ${processedText}`;

    // Kiểm tra xem có \choice (trắc nghiệm) hay không
    const choiceIndex = contentNoSol.search(/\\choice(?!TF)/);
    if (choiceIndex !== -1) {
      const choicesContent = contentNoSol.substring(choiceIndex);
      const groups = parseBraceGroupsAfterCommand(choicesContent, '\\choice', 4);
      const letters = ['A', 'B', 'C', 'D'];
      const options: QuestionOption[] = [];
      let correctAnswer: string | null = null;

      for (let j = 0; j < groups.length && j < 4; j++) {
        let choiceText = groups[j].trim();
        const isCorrect = /\\True/.test(choiceText);
        if (isCorrect) {
          choiceText = choiceText.replace(/\\True\s*/g, '').trim();
          correctAnswer = letters[j];
        }
        options.push({
          letter: letters[j],
          text: inlineTikzAsHtml(processLatexText(stripAllPlaceholders(choiceText)), images),
          isCorrect,
        });
      }

      questions.push({
        number: i + 1,
        part: 1,
        type: 'multiple_choice',
        text: fullQuestionHtml,
        options,
        correctAnswer,
        solution,
        images: [],
      });
    } else {
      questions.push({
        number: i + 1,
        part: 4,
        type: 'writing',
        text: fullQuestionHtml,
        options: [],
        correctAnswer: null,
        solution,
        images: [],
      });
    }
  }

  return questions;
}

export const validateTexExamData = (data: ExamData): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  if (!data.questions || data.questions.length === 0) {
    errors.push('Không tìm thấy câu hỏi nào trong file');
  }
  return { valid: errors.length === 0, errors };
};
