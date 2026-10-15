# QUY TẮC BẢO TOÀN VÀ XỬ LÝ ĐỀ THI (WORD, LATEX, PDF) CHO HỆ THỐNG THẦY THỌ

Antigravity AI Agent BẮT BUỘC tuân thủ các quy tắc này trong mọi phiên làm việc:

## 1. File Word (.docx)
- Parser: `src/services/mathWordParserService.ts`
- Nhận diện đầy đủ MathType binary WMF và Office Math OMML.
- Tự động nhận diện ion, phức chất, mũi tên phản ứng hóa học (có nhiệt độ, xúc tác, than chì, đpnc), enthalpy ($\Delta_f H^\circ_{298}$).
- Đánh số câu theo chuẩn Bộ GD&ĐT 2025: Phần I (Câu 1 - 18), Phần II (Câu 1 - 4, mỗi câu a, b, c, d), Phần III (Câu 1 - 6).
- Nhận diện 4 hình thức đáp án: Gạch chân (`<u>`), Highlight vàng, Màu chữ đỏ, Bảng đáp án cuối đề.
- Bảo toàn vị trí hình ảnh ở giữa câu hỏi.

## 2. File LaTeX (.tex)
- Parser: `src/services/texParserService.ts`
- Hỗ trợ môi trường `\begin{ex} ... \end{ex}`.
- Phần 1: `\choice {A} {\True B} {C} {D}` (`\True` là đáp án đúng).
- Phần 2: `\choiceTF {\True a} {b} {c} {\True d}` (chọn Đúng/Sai).
- Phần 3: `\shortans{đáp_án}` (trả lời ngắn).
- Phần 4: `\loigiai{...}` (lời giải tự luận).
- Tự động biên dịch `tikzpicture` sang ảnh PNG 300 DPI nhúng Base64.
- Hỗ trợ `\immini`, `\heva`, `\hoac`, và bảng `tabular` sang HTML table.

## 3. File PDF (.pdf)
- Wizard 5 bước: `src/components/PDFExamCreator.tsx`, `CreatePdfExamPage.tsx`.
- Nút bấm `[Tải lên từ PDF]` tại `ExamMgmt.tsx` với màu rose gradient `#e11d48 -> #f43f5e`.
- Tự động nạp file PDF và tải lên Supabase Storage bucket `exam-files`.
- Hỗ trợ nhập đáp án thủ công hoặc Import nhanh từ file TXT (`1A 2B 3C...`).
- Học sinh làm bài trên phòng thi điện tử hiển thị song song đề PDF gốc và phiếu trắc nghiệm.
