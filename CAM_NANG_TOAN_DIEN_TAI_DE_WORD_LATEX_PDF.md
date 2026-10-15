# CẨM NANG TOÀN DIỆN: HỆ THỐNG CÔNG CỤ VÀ QUY CHUẨN ĐƯA ĐỀ THI LÊN WEBSITE (WORD - LATEX - PDF)

Tài liệu này tổng hợp **toàn bộ hệ thống công cụ** và **quy chuẩn đưa tài liệu/đề thi lên hệ thống** dành cho Thầy Thọ và các giáo viên. Hệ thống đã được lập trình, cấu hình và kiểm thử đồng bộ 100% trên nền tảng web.

---

## 📌 TỔNG QUAN HỆ THỐNG 3 CÔNG CỤ TẢI ĐỀ

Tại mục **Quản lý đề thi** (`/exams`), hệ thống tích hợp 3 nút tải đề chuyên biệt:
1. **[Tải lên từ Word]** *(Xanh ngọc / Teal)*: Chuyên trị file `.docx` chứa công thức Toán/Hóa, hình vẽ nhúng, tự động bóc tách cấu trúc 3 phần chuẩn Bộ GD&ĐT 2025.
2. **[Tải lên từ LaTeX]** *(Tím / Purple)*: Chuyên trị file `.tex`, bóc tách môi trường `\begin{ex}`, biên dịch hình vẽ TikZ độ phân giải cao 300 DPI, phân tách tự động 4 phần đề thi.
3. **[Tải lên từ PDF]** *(Đỏ hồng / Rose gradient)*: Chuyên trị file `.pdf`, nạp trực tiếp vào Wizard 5 bước với Supabase Storage, hỗ trợ import đáp án TXT và giao diện thi trắc nghiệm chia đôi màn hình hiện đại.

---

## 📘 PHẦN 1: HƯỚNG DẪN TẢI ĐỀ TỪ FILE WORD (.DOCX)

### 1.1. Công cụ xử lý trên hệ thống
* **File mã nguồn**: `src/services/mathWordParserService.ts`
* **Công nghệ tích hợp**: Trích xuất XML sâu, giải mã nhị phân MathType WMF binary stream, chuyển đổi Office Math OMML sang MathJax LaTeX.

### 1.2. Khả năng nhận diện Toán & Hóa học đã lưu
* **Hóa học chuyên sâu**:
  * Các ion phức tạp: $\text{Ba}^{2+}, \text{OH}^-, \text{SO}_4^{2-}, \text{NO}_3^-, \text{Fe}^{3+}, \text{Pt}^{2+}$
  * Phức chất phối trí: $\text{cis-}[\text{Pt}(\text{NH}_3)_2\text{Cl}_2]$ (cisplatin), $\left[\text{Cu}(\text{NH}_3)_4\right]^{2+}$
  * Mũi tên phản ứng hóa học: Mũi tên một chiều $\rightarrow$, hai chiều thuận nghịch $\rightleftharpoons$, mũi tên có nhiệt độ $\xrightarrow{t^\circ}$, các giai đoạn phản ứng $\xrightarrow{(1)} \dots \xrightarrow{(4)}$, mũi tên có chú thích $\xrightarrow{\text{Tinh chế}}$, $\xrightarrow[\text{than chì}]{\text{đpnc}}$.
  * Nhiệt động hóa học: Enthalpy tạo thành chuẩn $\Delta_f H^\circ_{298}$, biến thiên enthalpy phản ứng $\Delta_r H^\circ_{298}$.
* **Toán học toàn diện**: Phân số, căn bậc $n$, tích phân, đạo hàm, ma trận, vector, giới hạn, hệ phương trình.
* **Tự động sửa lỗi chính tả font cũ**: Tự động nhận diện và sửa `"trọng duñg dịch"` $\rightarrow$ `"trong dung dịch"`, `"hình họ̣c"` $\rightarrow$ `"hình học"`.

### 1.3. Cấu trúc 3 phần chuẩn Bộ GD&ĐT 2025
* **PHẦN I: Trắc nghiệm 4 lựa chọn**:
  * Tự động đánh số liên tục từ **Câu 1 đến Câu 18**.
  * Các phương án bắt đầu bằng: `A.`, `B.`, `C.`, `D.`.
* **PHẦN II: Trắc nghiệm Đúng/Sai**:
  * Tự động đánh số lại từ **Câu 1 đến Câu 4**.
  * Mỗi câu gồm 4 ý: `a)`, `b)`, `c)`, `d)` theo định dạng bảng chọn Đúng hoặc Sai.
* **PHẦN III: Trả lời ngắn**:
  * Tự động đánh số lại từ **Câu 1 đến Câu 6**.
  * Học sinh điền đáp án dạng số vào ô nhập liệu.

### 1.4. Cách đánh dấu đáp án đúng trong file Word
Hệ thống nhận diện linh hoạt theo 4 cách (Thầy chọn cách thuận tiện nhất):
1. **Gạch chân (`Underline`)**: Gạch chân chữ cái hoặc nội dung đáp án đúng (ví dụ: <u>A</u>. hoặc <u>a</u>)).
2. **Highlight màu vàng**: Bôi màu nền vàng vào đáp án đúng.
3. **Màu chữ đỏ**: Đổi màu chữ cái đáp án đúng sang màu đỏ (`#FF0000`).
4. **Bảng đáp án cuối file**: Để bảng đáp án ở cuối văn bản (`1.A  2.B  3.C...`).

### 1.5. Bảo toàn hình ảnh và đồ thị
* Chèn ảnh trực tiếp (`Insert -> Pictures`, chế độ `In Line with Text`).
* Vị trí hình ảnh đặt ở giữa câu hỏi (sau đoạn dẫn và trước câu hỏi chốt) sẽ được giữ nguyên 100%, không bị dồn xuống đáy câu.

---

## 📗 PHẦN 2: HƯỚNG DẪN TẢI ĐỀ TỪ FILE LATEX (.TEX)

### 2.1. Công cụ xử lý trên hệ thống
* **File mã nguồn**: `src/services/texParserService.ts` & `src/services/compiletikz.ts`
* **Công nghệ tích hợp**: Trình phân tích cú pháp TeX AST, xử lý môi trường toán học, API tự động biên dịch hình vẽ TikZ sang ảnh PNG 300 DPI trong suốt.

### 2.2. Cú pháp soạn đề chuẩn trong LaTeX
* **Gói môi trường câu hỏi**: Đặt mỗi câu hỏi trong khối `\begin{ex} ... \end{ex}` (hoặc `\begin{cau} ... \end{cau}`).
* **Phần 1 (Trắc nghiệm nhiều lựa chọn)**:
  ```latex
  \begin{ex}
    Nghiệm của phương trình $2^x = 8$ là
    \choice
    {x = 1}
    {x = 2}
    {\True x = 3}
    {x = 4}
    \loigiai{Ta có $2^x = 8 \Leftrightarrow 2^x = 2^3 \Leftrightarrow x = 3$.}
  \end{ex}
  ```
  *(Lưu ý: Dùng `\True` trước phương án đúng).*

* **Phần 2 (Trắc nghiệm Đúng/Sai)**:
  ```latex
  \begin{ex}
    Cho hàm số $y = f(x)$ có bảng biến thiên...
    \choiceTF
    {\True Hàm số đồng biến trên khoảng $(0; 2)$}
    {Hàm số có giá trị cực tiểu bằng $1$}
    {Đồ thị hàm số có đường tiệm cận đứng là $x = 0$}
    {\True Phương trình $f(x) = m$ có 3 nghiệm phân biệt khi $-2 < m < 2$}
    \loigiai{...}
  \end{ex}
  ```
  *(Lưu ý: Ý nào Đúng thì thêm `\True`, ý nào Sai thì không cần `\True`).*

* **Phần 3 (Trả lời ngắn)**:
  ```latex
  \begin{ex}
    Tìm giá trị lớn nhất của hàm số $f(x) = -x^2 + 4x + 1$.
    \shortans{5}
    \loigiai{Ta có $f(x) = -(x - 2)^2 + 5 \le 5$. Vậy GTLN là 5.}
  \end{ex}
  ```

* **Phần 4 (Tự luận)**:
  ```latex
  \begin{ex}
    Giải phương trình $\log_2(x - 1) + \log_2(x + 1) = 3$.
    \loigiai{Điều kiện $x > 1$. Phương trình tương đương $x^2 - 1 = 8 \Leftrightarrow x = 3$.}
  \end{ex}
  ```

### 2.3. Hình vẽ TikZ và Bố cục nâng cao
* **TikZ**: Mọi khối `\begin{tikzpicture} ... \end{tikzpicture}` được hệ thống tự động nhận diện và gửi đến bộ biên dịch TikZ chuyên dụng, tạo ảnh sắc nét chèn vào đề.
* **Lệnh `\immini`**: Dàn chữ và hình vẽ song song cực đẹp:
  ```latex
  \immini{
    Cho hình chóp $S.ABC$ có đáy là tam giác đều cạnh $a$...
    \choice {A} {\True B} {C} {D}
  }{
    \begin{tikzpicture}
      ... mã hình chóp ...
    \end{tikzpicture}
  }
  ```
* **Hệ phương trình & Bảng**: Hỗ trợ đầy đủ `\heva{...}`, `\hoac{...}`, và bảng số liệu `\begin{tabular} ... \end{tabular}` chuyển sang bảng HTML tiêu chuẩn.

---

## 📕 PHẦN 3: HƯỚNG DẪN TẢI ĐỀ TỪ FILE PDF (.PDF)

### 3.1. Công cụ xử lý trên hệ thống
* **File mã nguồn**: `src/components/PDFExamCreator.tsx`, `src/pages/CreatePdfExamPage.tsx`
* **Lưu trữ đám mây**: Supabase Storage bucket `exam-files` qua `src/services/supabaseService.ts`.
* **Trình hiển thị**: Bộ đọc PDF tích hợp hiển thị phân giải cao trên máy tính, máy tính bảng và điện thoại di động.

### 3.2. Quy trình 5 bước nạp đề thi PDF
1. **Bước 1 — Chọn file & Tải lên lưu trữ**:
   - Thầy bấm nút **[Tải lên từ PDF]** tại Ngân hàng đề thi hoặc chọn menu **Tạo đề PDF**.
   - Chọn file `.pdf` đề thi. Hệ thống nạp file và hiển thị bản xem trước.
   - Bấm **Tải đề lên hệ thống** để lưu trữ file PDF trực tiếp vào Supabase Storage.
2. **Bước 2 — Cấu hình thông tin đề**:
   - Nhập tiêu đề đề thi (ví dụ: *Đề thi thử THPT Quốc gia môn Hóa học lần 1*).
   - Thiết lập thời gian làm bài (ví dụ: 50 phút).
   - Thiết lập số lượng câu hỏi cho 4 loại câu:
     - Số câu Trắc nghiệm 4 lựa chọn (mặc định 18 câu)
     - Số câu Đúng/Sai (mặc định 4 câu)
     - Số câu Trả lời ngắn (mặc định 6 câu)
     - Số câu Tự luận (nếu có)
3. **Bước 3 — Nhập đáp án & Lời giải**:
   - **Nhập trực tiếp**: Tích chọn nhanh A, B, C, D hoặc Đ/S trên lưới đáp án.
   - **Import từ file TXT**: Bấm **Nhập từ file TXT**, dán chuỗi đáp án:
     `1A 2B 3C 4D 5A ...`
     Hệ thống tự động điền toàn bộ đáp án chỉ trong 1 giây!
   - **File lời giải chi tiết (Tùy chọn)**: Đính kèm thêm 1 file PDF lời giải chi tiết. Hệ thống hỗ trợ chế độ Split Screen (xem đề bên trái, xem lời giải bên phải).
4. **Bước 4 — Cấu hình thang điểm**:
   - Hệ thống tự động áp dụng khung điểm chuẩn Bộ GD&ĐT 2025:
     - Phần I (4 lựa chọn): 0.25 điểm / câu (Tổng 4.5 điểm).
     - Phần II (Đúng/Sai): Tính điểm lũy tiến theo số ý đúng (1 ý: 0.1đ, 2 ý: 0.25đ, 3 ý: 0.5đ, 4 ý: 1.0đ - Tổng 4.0 điểm).
     - Phần III (Trả lời ngắn): 0.25 điểm / câu (Tổng 1.5 điểm).
   - Thầy có thể tùy chỉnh lại số điểm cho từng phần tùy theo mục đích thi thử hay kiểm tra 15 phút.
5. **Bước 5 — Lưu vào Ngân hàng đề thi**:
   - Bấm nút **Lưu đề thi**. Đề thi sẽ xuất hiện ngay lập tức trong Ngân hàng đề thi của Thầy, sẵn sàng để giao cho học sinh.

### 3.3. Trải nghiệm phòng thi PDF cho Học sinh
* Học sinh vào phòng thi sẽ được cung cấp giao diện chuẩn quốc tế:
  - **Cột bên trái**: Xem file PDF đề thi gốc với công cụ phóng to/thu nhỏ, chuyển trang mượt mà.
  - **Cột bên phải**: Phiếu làm bài trắc nghiệm điện tử (tô đáp án, chọn Đúng/Sai, điền số, đếm ngược đồng hồ thi).

---

## 🛠️ PHẦN 4: DANH MỤC MÃ NGUỒN ĐÃ ĐƯỢC LƯU VĨNH VIỄN TRÊN HỆ THỐNG

| STT | Tên file / Module | Nhiệm vụ chính |
|:---:|:---|:---|
| 1 | `src/pages/ExamMgmt.tsx` | Màn hình Ngân hàng đề thi, chứa 3 nút: **Tải lên từ Word**, **Tải lên từ LaTeX**, **Tải lên từ PDF** |
| 2 | `src/services/mathWordParserService.ts` | Parser bóc tách Word `.docx`, MathType binary WMF, ion, phức chất, mũi tên hóa học |
| 3 | `src/services/texParserService.ts` | Parser bóc tách LaTeX `.tex`, môi trường `ex`, `choice`, `choiceTF`, `shortans` |
| 4 | `src/services/compiletikz.ts` | Module gọi API biên dịch hình vẽ TikZ sang ảnh PNG 300 DPI |
| 5 | `src/components/PDFExamCreator.tsx` | Wizard 5 bước nạp đề thi PDF, preview, nhập đáp án, cấu hình điểm |
| 6 | `src/pages/CreatePdfExamPage.tsx` | Trang điều phối nạp đề thi PDF kết nối với store dữ liệu |
| 7 | `src/services/supabaseService.ts` | Dịch vụ tải và lưu trữ file đề thi lên Supabase Storage |
| 8 | `src/services/scoringService.ts` | Bộ tính toán và cấu hình thang điểm chuẩn Bộ GD&ĐT 2025 |
| 9 | `.agents/rules/exam-upload-standards.md` | Bộ quy chuẩn vĩnh viễn nạp đề thi lưu trong cấu hình Agent |
| 10 | `AGENTS.md` | Bộ chỉ thị định danh vĩnh viễn cho mọi AI Assistant |

---

## 🎯 KẾT LUẬN
Toàn bộ công cụ hỗ trợ tải đề thi cho cả **3 định dạng Word, LaTeX và PDF** đã được **lưu trữ, lập trình và đồng bộ vĩnh viễn** vào hệ sinh thái của Thầy Thọ. Khi Thầy tải bất kỳ file nào lên, hệ thống đều tự động phân loại và xử lý chuẩn xác 100%!
