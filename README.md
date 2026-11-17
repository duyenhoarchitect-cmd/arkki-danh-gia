# Arkki – Đánh giá học sinh

Ứng dụng web để giáo viên Arkki chấm điểm năng lực học sinh theo từng buổi, tự tổng hợp đầu kỳ/cuối kỳ, sinh nhận xét và xuất Excel (mỗi học sinh một sheet, có biểu đồ radar) theo mẫu in.

- Giao diện: một trang tĩnh, chạy trên GitHub Pages.
- Dữ liệu và đăng nhập: Supabase (Postgres + Auth). Dữ liệu học sinh **không** nằm trong repo này.
- Quản lý theo Năm học/Học kỳ → Trường → Lớp → Học sinh & Bài học.

## Vai trò

| Vai trò | Quyền |
|---|---|
| Quản trị (admin) | Toàn quyền, phân vai trò, khóa/mở tài khoản, sao lưu/khôi phục |
| Quản lý | Quản lý danh mục, phân công giáo viên, xem và sửa mọi lớp |
| Giáo viên | Chỉ thấy và chấm các lớp được phân công (tab Chấm điểm, Tổng hợp) |

Tài khoản **đăng ký đầu tiên** tự động là Quản trị. Các tài khoản sau là Giáo viên, chưa có lớp cho tới khi được phân công trong *Danh mục → Giáo viên & phân công*.

## Cài đặt lần đầu

1. **Supabase**: tạo project, vào *SQL Editor*, dán toàn bộ `supabase/schema.sql` và chạy (chạy lại nhiều lần vẫn an toàn).
2. **Supabase → Authentication → URL Configuration**: đặt *Site URL* và *Redirect URLs* là địa chỉ GitHub Pages, ví dụ `https://<tài-khoản>.github.io/arkki-danh-gia/`.
3. **config.js**: điền `supabaseUrl` và `supabaseKey` (khóa *anon public*, không bao giờ dùng khóa *service_role*). Khóa anon được phép công khai; quyền truy cập do RLS trong schema kiểm soát.
4. **GitHub → Settings → Pages**: chọn *Source = GitHub Actions*. Mỗi lần đẩy lên `main` sẽ tự build và triển khai.
5. Mở trang, đăng ký tài khoản Quản trị, rồi vào *Cài đặt → Sao lưu/khôi phục* để nạp tệp dữ liệu (JSON) nếu có.

Nếu `config.js` để trống, ứng dụng chạy chế độ dùng thử, lưu trong trình duyệt.

## Phát triển

```bash
python3 scripts/build.py web       # dist/index.html cho GitHub Pages
python3 scripts/build.py artifact  # bản một tệp dùng thư viện từ CDN
```

- `src/app.html`: giao diện và logic chấm điểm, tổng hợp, nhận xét.
- `src/export.js`: xuất Excel theo mẫu (ExcelJS + chèn biểu đồ radar).
- `supabase/schema.sql`: bảng, quyền RLS, hàm `merge_record` (gộp sửa đồng thời), nhật ký thay đổi.

## Quy tắc tính điểm

- Điểm là số nguyên 1..mức tối đa của trường (3 hoặc 4); để trống hoặc vắng không tính là 0.
- Đầu kỳ = buổi 1. Cuối kỳ = trung bình các điểm hợp lệ từ buổi 2 đến buổi cuối.
- Cấp độ = làm tròn trung bình (0,5 làm tròn lên), không vượt mức tối đa.
