# DinkBit

Project web **riêng biệt với Unity**, quản lý công nợ cá nhân bằng tiếng Việt / VND. Dữ liệu lưu thật vào PostgreSQL, không dùng localStorage làm database và không dùng API giả.


Tên ứng dụng là **DinkBit**. Thư mục `D:\projects\debtbook`, tên database/bucket, khóa lưu giao diện và thông tin đăng nhập demo giữ nguyên để không mất dữ liệu hoặc cấu hình hiện có.

## Chạy nhanh trên máy này, không cần Docker

Yêu cầu Node.js 22+ (khuyến nghị Node.js 24). Trong PowerShell dùng `npm.cmd` nếu `npm.ps1` bị chặn bởi Execution Policy:

```powershell
cd D:\projects\debtbook
npm.cmd install
npm.cmd run dev:local
```

Mở **http://localhost:3000**. Script tạo `.env` với secret ngẫu nhiên nếu chưa tồn tại, khởi động PostgreSQL UTF-8 chỉ lắng nghe trên loopback, áp dụng migrations, seed dữ liệu minh họa rồi chạy Next.js. Database nằm trong `.local/postgres-utf8`; dữ liệu được giữ khi dừng/chạy lại. Dùng Ctrl+C để dừng. Không chạy hai phiên `dev:local` cùng lúc hoặc chạy cùng với PostgreSQL/Docker đang dùng cổng 5432.

Script cũng generate Prisma Client trước khi chạy. Khi sửa schema, dừng dev server rồi chạy `npm.cmd run db:generate`; Windows có thể khóa DLL của Prisma khi một tiến trình đang dùng nó. Lệnh `build` không generate lại client đang bị khóa.

Tài khoản demo: **demo@debtbook.vn** / **DebtBook@2026**. Có 8 người liên hệ, 24 khoản công nợ và các lần thanh toán. Seed không ghi đè dữ liệu cũ. Đăng ký tài khoản mới để có cuốn sổ trống hoàn toàn riêng biệt. Không dùng mật khẩu demo trên production.

## PostgreSQL riêng hoặc Docker

```powershell
Copy-Item .env.example .env
docker compose up -d
npm.cmd install
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run dev
```

Sửa `DATABASE_URL`, `AUTH_URL`, `AUTH_SECRET` trong `.env`. Tạo secret bằng `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. `.env` và database local không được đưa vào Git. `AUTH_URL` phải khớp origin sử dụng trong trình duyệt, mặc định `http://localhost:3000`.

## Chức năng

- Dashboard: tổng phải thu / phải trả / tổng số dư / quá hạn, biểu đồ số dư lịch sử, phân bổ, công nợ gần đây, sắp đến hạn.
- Công nợ: thêm nhanh, chọn/tạo người ngay trong form, sửa, chi tiết, tìm kiếm debounce, lọc loại / trạng thái / ngày / số tiền, sắp xếp và phân trang.
- Thanh toán: nhiều lần, ngày thực tế, phương thức, ghi chú, progress và lịch sử hoạt động. Không cho trả vượt số dư.
- Người liên hệ: hồ sơ, số dư hai chiều và ròng, công nợ phân trang, 12 lần thanh toán gần nhất.
- Giao dịch: tìm kiếm, lọc người / loại / phương thức / ngày, sắp xếp, phân trang.
- Báo cáo: số dư hiện tại, thu/trả trong kỳ, top người nợ, khoảng 7/30/90/180/365 ngày hoặc tùy chọn tối đa 1 năm. CSV và Excel là công nợ **tạo trong kỳ**; In / PDF sử dụng hộp thoại in của trình duyệt (chọn Save as PDF).
- Nhắc thanh toán: trước hạn 1/3/7 ngày, lịch nhắc riêng, thông báo trong ứng dụng, sao chép lời nhắc hoặc soạn email bằng ứng dụng email của người dùng. Không tự gửi email/SMS cho người liên hệ.
- Notification center: công nợ mới, thanh toán mới, thanh toán hết, sắp hạn, quá hạn, đánh dấu đã đọc. Phím `/` mở tìm kiếm toàn hệ thống.
- Light / Dark Mode, sidebar desktop, menu và bottom navigation mobile, nút thêm nhanh, dialog có focus trap/Escape, validation, loading/error/empty states và toast.
- Đăng ký, email/mật khẩu, Google tùy cấu hình, quên/đặt lại mật khẩu qua SMTP. Ghi nhớ: 7 ngày; không chọn: 12 giờ. Đổi mật khẩu làm vô hiệu các phiên cũ.

## Tài khoản quản trị

- Email quản trị mặc định: `tranngocnguyendinh@gmail.com` (cấu hình bằng `ADMIN_EMAIL`).
- `npm run dev:local` tạo mật khẩu ngẫu nhiên trong `ADMIN_PASSWORD` của `.env` nếu chưa cấu hình. Mở `.env` để lấy mật khẩu; không chia sẻ hoặc commit file này.
- Đăng nhập tại `/login`, rồi mở **Quản trị** hoặc `/admin` để xem danh sách tài khoản và tạo tài khoản người dùng. Không cấp quyền admin từ form đăng ký hoặc API client.
- Admin không được đọc công nợ, người liên hệ hoặc giao dịch của người khác. Chỉ tên, email, vai trò và ngày tạo xuất hiện trong danh sách quản trị.
- Với PostgreSQL bên ngoài: đặt `ADMIN_PASSWORD` ít nhất 16 ký tự, chạy `npm run db:generate`, `npm run db:migrate`, rồi `npm run db:admin`. Lệnh này không tạo dữ liệu demo.
- Bootstrap không đặt lại mật khẩu của admin đã tồn tại. Nếu email cấu hình đang thuộc một người dùng thường, bootstrap chuyển quyền, đặt mật khẩu bootstrap và thu hồi các phiên, liên kết OAuth, token đặt lại mật khẩu cũ; giữ nguyên dữ liệu công nợ.
- `ADMIN_PASSWORD` chỉ dùng khi khởi tạo/chuyển quyền, không phải cơ chế đổi mật khẩu mỗi lần khởi động. Đổi mật khẩu bằng quy trình đặt lại mật khẩu đã cấu hình SMTP. Không dùng mật khẩu demo cho admin.

## Cho AI bên ngoài đọc / ghi công nợ

Mở **Cài đặt → Kết nối AI & API**. Tạo token **Chỉ đọc** hoặc **Đọc và ghi**, chọn thời hạn và lưu token khi được hiển thị lần đầu. Mặc định chưa công cụ bên ngoài nào được truy cập dữ liệu. Token gắn với tài khoản tạo ra, kể cả admin cũng không được đọc sổ của người khác.

- API: `/api/ai`, xác thực bằng `Authorization: Bearer <token>`; không dùng mật khẩu đăng nhập.
- OpenAPI công khai, không chứa dữ liệu cá nhân: `/api/ai/openapi`. Import vào công cụ AI có hỗ trợ HTTP/OpenAPI rồi đặt token trong cấu hình bí mật của connector.
- Đọc tổng hợp, người liên hệ, danh sách/chi tiết công nợ và lịch sử thanh toán; tạo người liên hệ, tạo/sửa công nợ khi token có quyền ghi. Không mở API xóa, thanh toán hay quản trị tài khoản.
- Mọi lần ghi cần UUID `requestId`: giữ nguyên token, UUID và dữ liệu khi retry để tránh tạo công nợ trùng. Validation, phân quyền và cập nhật sổ chạy cùng transaction với bản ghi chống trùng.
- Token lưu hash, hiển thị rõ một lần, có hạn dùng và thu hồi trong Cài đặt. Đặt lại mật khẩu vô hiệu hóa token cũ. Token cấp quyền đọc dữ liệu riêng tư; chỉ đưa cho công cụ bạn tin tưởng.
- AI chạy từ xa không truy cập được `localhost` của bạn. Deploy lên tên miền HTTPS, đặt `AUTH_URL` đúng tên miền và chạy migration mới trên PostgreSQL production. Không đưa token vào URL, Git, frontend công khai hoặc nội dung chat.

Xem `docs/ai-api.md` để biết ví dụ gọi API, giới hạn và yêu cầu xác nhận thao tác ghi. Tính năng này cung cấp API/connector contract; không tự đăng nhập vào các dịch vụ AI và chưa phải MCP server.

## Dịch vụ tùy chọn

### Google Login

Điền `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`; khai báo callback `http://localhost:3000/api/auth/callback/google` trong Google Cloud. Nút Google tắt rõ ràng nếu chưa cấu hình. Chỉ chấp nhận email đã được Google xác minh; không tự động liên kết một tài khoản có email trùng.

### Email khôi phục

Điền `SMTP_URL` và `MAIL_FROM`. Ví dụ `smtp://user:password@smtp.example.com:587` (URL-encode user/password). Token ngẫu nhiên, database chỉ lưu hash, hết hạn sau 30 phút, dùng một lần. Nếu chưa có SMTP, ứng dụng thông báo rõ dịch vụ chưa cấu hình.

### Đính kèm S3 / MinIO

`dev:local` **không** khởi động S3. Dùng dịch vụ S3-compatible và cấu hình `S3_*`, hoặc chạy `docker compose up -d storage`. Với MinIO: mở `http://localhost:9001`, đăng nhập bằng giá trị trong compose, tạo bucket `debtbook` và giữ **private**. Không bật anonymous download. Khi dùng S3 AWS, bỏ `S3_ENDPOINT`, đặt region và `S3_FORCE_PATH_STYLE=false`.

Nhận JPG/PNG/WebP/PDF tối đa 5 MB; kiểm tra MIME, extension và magic bytes phía server. File lưu với key ngẫu nhiên và phân vùng user/debt. Tải xuống chỉ sau kiểm tra chủ sở hữu, qua URL ký hạn 60 giây. Nếu tải tệp lỗi sau khi tạo khoản nợ, khoản nợ vẫn được lưu và UI báo rõ để tải lại trong trang chi tiết. Chưa tích hợp quét antivirus; bổ sung trước khi mở upload công khai.

### Nhắc tự động

Lên lịch gọi `GET /api/cron` hằng ngày với header `Authorization: Bearer <CRON_SECRET>`. Route xử lý các thông báo đến hạn, lịch nhắc và dọn rate-limit/token hết hạn. Khi ứng dụng đang mở, notification center cũng cập nhật mỗi phút. Chưa cấu hình cron thì không có tác vụ nền khi ứng dụng đóng.

## Tính nhất quán và phân quyền

- Mọi API dữ liệu đều kiểm tra session, session version và chủ sở hữu **ở backend**; không tin userId từ client.
- Tiền là số nguyên VND, dùng `BigInt` trong database; mỗi khoản tối đa 1.000 tỷ. Số dư và trạng thái được suy ra, không lưu nhiều bản sao dễ lệch. Ngày hết hạn theo ngày lịch ở `APP_TIMEZONE` (mặc định UTC+7).
- Thanh toán, sửa và đóng công nợ dùng transaction `Serializable` với retry; có requestId chống ghi nhận lại, check constraint ở PostgreSQL và cấm sửa người/loại sau khi có thanh toán.
- Xóa khoản đã có thanh toán hoặc đính kèm bị chặn. **Đóng** là hủy theo dõi: bỏ khỏi số dư/biểu đồ, giữ nguyên lịch sử, không tự ghi một giao dịch thanh toán giả. Biểu đồ cũng loại công nợ đã đóng, không phải báo cáo kiểm toán lịch sử bất biến.
- Mật khẩu dùng scrypt + salt ngẫu nhiên. Rate limit lưu trong PostgreSQL. Mutation kiểm tra Origin; Auth.js quản lý CSRF cho đăng nhập. React escape nội dung người dùng. CSV ngăn formula injection.
- Production cần HTTPS, secrets riêng, backup database, bảo vệ cổng database/S3, body-size limit ở reverse proxy, lịch cron và giám sát/logging. Không triển khai `.local` hay tài khoản demo.

## Kiểm tra

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test
npm.cmd run build
```

Test API là test tích hợp **thật** với server/database, mặc định bỏ qua để unit tests không phụ thuộc dịch vụ. Chạy `dev:local` ở terminal khác, sau đó:

```powershell
$env:TEST_BASE_URL = 'http://localhost:3000'
npm.cmd run test
Remove-Item Env:\TEST_BASE_URL
```

Tests tạo tài khoản kiểm thử và dọn riêng dữ liệu của chúng, kiểm tra phân quyền chéo, thanh toán lặp/đồng thời, chống vượt dư, CSV/XLSX, upload giả và CSRF. Test admin dùng `ADMIN_EMAIL`/`ADMIN_PASSWORD` từ `.env`, kiểm tra tạo tài khoản, chống nâng quyền, quyền quản trị ở backend và bootstrap không reset mật khẩu. Chỉ chạy trên môi trường development/test.

Test trình duyệt (server cần đang chạy): `npm.cmd run test:e2e`. Windows dùng Microsoft Edge sẵn có; Linux/macOS chạy `npx playwright install chromium` trước. Có thể chọn browser qua `PLAYWRIGHT_CHANNEL`. Test chụp dashboard desktop/mobile/dark và admin mobile vào `.local/`, kiểm tra luồng đăng ký → tạo người/công nợ → thanh toán → tải lại và admin tạo tài khoản. Test tự dọn tài khoản và dữ liệu của riêng nó.

`npm audit --omit=dev` dùng để kiểm tra dependencies runtime. Bộ ESLint của Next.js có thể còn advisory chưa có bản vá ở dependencies glob/braces; không dùng `npm audit fix --force` vì có thể hạ Next.js/ESLint và phá tương thích. Auth.js hiện dùng bản v5 beta đã khóa trong lockfile; cần đánh giá lại trước khi triển khai production.

## Cấu trúc

```text
prisma/                 Schema, migrations, seed
scripts/local.ts        PostgreSQL local + bootstrap + dev server
src/auth.ts             Auth.js Credentials / Google
src/app/api/            Backend dữ liệu, auth, export, upload, cron
src/components/         Workspace, dashboard, danh sách, chi tiết, forms
src/components/ui/      Button, dialog và primitives theo cấu trúc shadcn/ui
src/lib/                Domain, validation, queries, mutations, security
tests/                  Unit và integration tests
```

Stack: Next.js App Router, TypeScript, Tailwind CSS 4, Radix/shadcn-style primitives, Lucide, Recharts lazy-loaded, React Hook Form + Zod, Prisma + PostgreSQL, Auth.js, S3-compatible storage.
