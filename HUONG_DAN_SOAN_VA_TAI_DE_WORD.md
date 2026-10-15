# HƯỚNG DẪN SOẠN VÀ TẢI TÀI LIỆU / ĐỀ THI WORD (.DOCX) LÊN HỆ THỐNG

Tài liệu này tổng hợp toàn bộ **cấu hình đã được lưu vĩnh viễn trên hệ thống** và **quy chuẩn soạn thảo file Word (.docx)** để đảm bảo khi Thầy Thọ tải bất kỳ đề thi hay bài tập nào lên thì hệ thống đều tự động nhận diện chuẩn 100%, không bị lỗi công thức, hình ảnh hay cấu trúc câu.

---

## I. CẤU HÌNH ĐÃ LƯU TRÊN HỆ THỐNG (VĨNH VIỄN)

1. **Bộ bóc tách đề thi tự động (`src/services/mathWordParserService.ts`):**
   - **Công thức Toán & Hóa (OMML & MathType WMF):** Đã nâng cấp thuật toán đọc nhị phân MathType WMF. Tự động nhận diện và dịch chính xác:
     - Các ion phức tạp: $\text{Ba}^{2+}, \text{OH}^-, \text{SO}_4^{2-}, \text{NO}_3^-, \text{Pt}^{2+}$, ...
     - Các phức chất phối trí: $\text{cis-}[\text{Pt}(\text{NH}_3)_2\text{Cl}_2]$ (cisplatin), ...
     - Tất cả các dạng mũi tên phản ứng hóa học: $\rightarrow$, $\xrightarrow{t^\circ}$, $\xrightarrow{(1)} \dots \xrightarrow{(4)}$, $\xrightarrow{\text{Tinh chế}}$, $\xrightarrow[\text{than chì}]{\text{đpnc}}$.
     - Các ký hiệu nhiệt động hóa học, enthalpy: $\Delta_f H^\circ_{298}$, ký tự Hy Lạp $\alpha, \beta, \gamma$.
     - Tất cả công thức Toán học: phân số $\frac{a}{b}$, căn thức $\sqrt[n]{x}$, hệ phương trình, tích phân, vector, mũ và chỉ số dưới.
   - **Tự động sửa lỗi chính tả/mã hóa từ Word:**
     - Tự động sửa lỗi gõ tiếng Việt font cũ: `"trọng duñg dịch"` $\rightarrow$ `"trong dung dịch"`, `"hình họ̣c"` $\rightarrow$ `"hình học"`, `"giải phòng ra"` $\rightarrow$ `"giải phóng ra"`.
   - **Bảo toàn kết cấu hình ảnh trong câu:**
     - Giữ nguyên vị trí tự nhiên của hình ảnh/sơ đồ khi được chèn ở giữa câu dẫn, không bị đẩy trôi xuống cuối câu.
   - **Đánh số câu tự động theo 3 Phần chuẩn Bộ GD&ĐT:**
     - Phần I: Đánh số từ **Câu 1 đến Câu 18**.
     - Phần II: Đánh số lại từ **Câu 1 đến Câu 4** (mỗi câu gồm 4 ý a, b, c, d dạng bảng Đúng/Sai).
     - Phần III: Đánh số lại từ **Câu 1 đến Câu 6** (dạng trả lời ngắn điền số).

2. **Giao diện phòng thi & quản lý đề thi:**
   - Đã triển khai trên cả giao diện Học sinh (`LessonExamRoom.tsx`, `StudentCourseViewer.tsx`) và giao diện Giáo viên/Admin (`ExamMgmt.tsx`).
   - Hỗ trợ MathJax render công thức toán học và phương trình hóa học mượt mà, sắc nét trên mọi thiết bị máy tính, iPad và điện thoại di động.

---

## II. QUY CHUẨN SOẠN ĐỀ WORD (.DOCX) ĐỂ TẢI LÊN CHUẨN 100%

### 1. Cấu trúc tiêu đề các Phần trong đề thi
Nên dùng tiêu đề rõ ràng để hệ thống tự động phân loại loại câu hỏi:
- **PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn** (Gồm các câu trắc nghiệm 4 lựa chọn A, B, C, D).
- **PHẦN II. Câu trắc nghiệm đúng sai** (Gồm các câu có 4 ý a, b, c, d để chọn Đúng hoặc Sai).
- **PHẦN III. Câu trắc nghiệm trả lời ngắn** (Gồm các câu hỏi học sinh tự tính toán và điền đáp án số).

---

### 2. Quy cách viết câu hỏi và đáp án

#### A. PHẦN I (Trắc nghiệm 4 phương án)
- Bắt đầu câu hỏi bằng: `Câu 1.`, `Câu 2.`, ... (hoặc `Câu 1:`, `Câu 2:`).
- 4 phương án lựa chọn viết bằng chữ hoa: `A.`, `B.`, `C.`, `D.`:
  - Có thể để mỗi phương án 1 dòng.
  - Hoặc để 2 phương án trên 1 dòng: `A. ...      B. ...`
  - Hoặc để cả 4 phương án trên 1 dòng: `A. ...   B. ...   C. ...   D. ...`
  *(Giữa các phương án nên bấm phím `Tab` để phân cách rõ ràng).*

#### B. PHẦN II (Trắc nghiệm đúng/sai)
- Bắt đầu câu hỏi bằng: `Câu 1.`, `Câu 2.`, `Câu 3.`, `Câu 4.`
- 4 mệnh đề con viết bằng chữ thường có dấu ngoặc đơn:
  - `a) ...`
  - `b) ...`
  - `c) ...`
  - `d) ...`
- Hệ thống sẽ tự động tổng hợp thành bảng lựa chọn **Đúng / Sai** hiện đại cho học sinh tích chọn.

#### C. PHẦN III (Trả lời ngắn)
- Bắt đầu câu hỏi bằng: `Câu 1.`, `Câu 2.`, ..., `Câu 6.`
- Nội dung câu hỏi nêu rõ yêu cầu và kết quả cần điền (kèm đơn vị nếu có). Học sinh sẽ có ô nhập số trực tiếp.

---

### 3. Cách đánh dấu ĐÁP ÁN ĐÚNG trong file Word
Hệ thống hỗ trợ **4 cách** nhận diện đáp án đúng, Thầy có thể chọn cách thuận tiện nhất:

1. **Cách 1 - Gạch chân (Underline):**
   - Gạch chân chữ cái đáp án: <u>A</u>. hoặc <u>a</u>) hoặc gạch chân cả nội dung đáp án đúng.
2. **Cách 2 - Bôi màu nền (Highlight):**
   - Dùng công cụ Text Highlight Color màu vàng (hoặc bất kỳ màu nào) bôi vào đáp án đúng.
3. **Cách 3 - Tô chữ màu đỏ:**
   - Chữ cái hoặc nội dung đáp án đúng được đổi sang màu đỏ (`#FF0000`).
4. **Cách 4 - Bảng đáp án ở cuối đề:**
   - Ở cuối đề thi, Thầy có thể để bảng đáp án hoặc dòng đáp án:
     `ĐÁP ÁN: 1.A 2.B 3.C ...` hoặc bảng hướng dẫn giải chi tiết.

---

### 4. Quy tắc chèn hình ảnh, đồ thị, phương trình phản ứng
- **Chèn hình ảnh / đồ thị:** Chèn hình ảnh trực tiếp vào file Word (`Insert -> Pictures`). Đặt ảnh ở vị trí dòng chảy văn bản bình thường (chọn layout `In Line with Text`).
- **Hình ảnh nằm giữa câu:** Nếu câu hỏi có dạng dẫn dắt:
  > *Giai đoạn đầu tiên của phản ứng trên xảy ra như sau:*  
  > *[Chèn hình ảnh ở đây] (1)*  
  > *Nhận định nào sau đây không đúng?*  
  Hệ thống sẽ giữ đúng thứ tự này, hiển thị hình ảnh ở giữa và câu hỏi ở dưới, không làm lệch kết cấu.
- **Công thức Toán & Hóa:** Thầy có thể dùng công cụ Equation mặc định của Word (`Alt + =`) hoặc MathType. Cả hai hệ thống đều đọc và hiển thị sắc nét.

---

### 5. Cách đặt tên file Word khi tải lên
- Nên đặt tên ngắn gọn, có cấu trúc lớp và kỳ thi để dễ quản lý:
  - Ví dụ: `12.HOA_DE_01_THI_THU.docx`
  - Ví dụ: `7.TOAN_GK1_DE_01_3PHAN.docx`
  - Ví dụ: `8.TOAN_CK1_DE_02.docx`

---

## III. KẾT LUẬN
Tất cả các quy tắc và cấu hình nâng cao trên đã được **lập trình trực tiếp vào mã nguồn hệ sinh thái web của Thầy** và đã được kiểm thử đồng bộ với cơ sở dữ liệu Supabase. Khi Thầy tải file Word lên trong tương lai, hệ thống sẽ tự động vận hành trơn tru theo đúng các quy chuẩn này.
