# Kịch bản kiểm thử và demo local Stage 5

Ngày soạn: 2026-10-05. Project đã chạy bằng `corepack pnpm dev`. Đây là hướng dẫn thực hiện, không phải báo cáo các ca đã chạy thành công. Mọi ca ban đầu là **Chưa chạy**.

## 1. Chuẩn bị một lần

1. Giữ terminal đang chạy project mở. Không chạy thêm một tiến trình `dev` trên cùng cổng.
2. Mở terminal khác tại thư mục chứa `package.json` gốc:

   ```powershell
   cd "C:\Users\CONG NHAT\Downloads\FA26\Dike\Dike"
   Invoke-RestMethod "http://localhost:3001/api/v1/health/ready"
   ```

   Mong đợi: HTTP 200. Nếu 503 hoặc không kết nối được, xử lý hạ tầng trước khi đánh dấu lỗi nghiệp vụ.

3. Nếu chưa có tài khoản demo, chạy `corepack pnpm db:seed:stage5`. Lệnh tạo Sandbox Admin One, Sandbox Admin Two, Sandbox Member, Sandbox School và xe nháp `SYNTH-DEMO-001`. Seed không reset các quyết định đã thực hiện và không khôi phục tài khoản đã xóa.
4. Chuẩn bị ba phiên trình duyệt độc lập: **M** = Chrome thường, **A1** = Chrome ẩn danh, **A2** = Edge hoặc profile trình duyệt riêng. Hai tab cùng profile chia sẻ cookie; hai cửa sổ ẩn danh cùng trình duyệt thường cũng chia sẻ phiên, không dùng chúng như hai tài khoản độc lập.
5. Trong mỗi phiên mở `http://localhost:3000/login`, bấm **Tiếp tục với Google**, chọn lần lượt **Sandbox Member**, **Sandbox Admin One**, **Sandbox Admin Two**, bấm **Tiếp tục**. Đây là đăng nhập mock, không cần mật khẩu Google.
6. Dùng Paint vẽ ba ảnh, ghi rõ `DEMO ONLY`: `identity-demo.png`, `vehicle-demo.png`, `avatar-demo.png`. Lưu PNG nhỏ, dưới 5 MiB và 16 megapixel. Không dùng giấy tờ thật. Mỗi lần gửi lại phải tải ảnh lên lại để có file ID mới; có thể dùng lại ảnh tổng hợp trên máy.
7. Chọn mã đợt chạy, ví dụ `20261005-01`. Dùng biển số `SYNTH-CAR-20261005-01`, slug `demo-20261005-01` để tránh trùng dữ liệu lần trước.
8. Ghi trạng thái ban đầu của M tại `/app` và `/settings/verification`. Nếu M đã được duyệt từ lần demo trước, chạy luồng chính từ bước xe/cộng đồng; muốn kiểm tra từ đầu thì A1 thu hồi danh tính ở cuối đợt trước, sau đó M tạo hồ sơ mới. Việc thu hồi làm mất quyền chủ xe, vì vậy không thực hiện giữa demo chính.

Quy ước: mọi đường dẫn dưới đây bắt đầu bằng `http://localhost:3000`. Sau thao tác ở phiên khác, giữ trang pending ở foreground khoảng 7–15 giây. Trang đã kết thúc xử lý không poll liên tục: tải lại trang hoặc mở lại dashboard để lấy trạng thái mới. Với callback worker, nếu quá 30 giây chưa đổi trạng thái thì kiểm tra log; tình huống timeout có thể cần 1–2 phút vì worker quét theo chu kỳ.

## 2. Luồng demo chính — chạy theo thứ tự (khoảng 20–30 phút)

### TC-01 — Đăng nhập và phân quyền ban đầu

1. M mở `/app`.
2. Kiểm tra điện thoại đã xác minh; nếu chưa từng duyệt danh tính, danh tính phải là **Chưa gửi hồ sơ**, quyền chủ xe là **Chưa được cấp**.
3. M nhập trực tiếp `/admin` trên thanh địa chỉ.
4. A1 mở `/admin`.

**Đạt:** M thấy thông báo không có quyền quản trị; A1 thấy các mục xét duyệt danh tính, xe, membership và quản lý cộng đồng. Điện thoại đã xác minh không tự cấp danh tính hoặc quyền chủ xe. Nếu seed vừa chạy mà không thấy quyền mới, đăng xuất rồi đăng nhập lại.

### TC-02 — Hồ sơ và điều khoản

1. M mở `/settings/profile`.
2. Đổi **Tên hiển thị** thành `Demo Member 20261005`, nhập giới thiệu `Dữ liệu tổng hợp kiểm thử local`, bấm **Lưu hồ sơ**.
3. Đọc liên kết điều khoản, tích **Tôi chấp nhận điều khoản thử nghiệm.** và **Tôi đã đọc thông báo quyền riêng tư.**
4. Bấm **Lưu lựa chọn dữ liệu**. Tải lại trang, kiểm tra tên và lựa chọn còn được lưu.
5. Có thể chọn loại ảnh **Ảnh đại diện**, tải `avatar-demo.png`, bấm **Tải ảnh lên**.

**Đạt:** thông tin được lưu, avatar hiển thị nếu đã tải; không có lỗi consent khi tải minh chứng ở bước sau. Không cần bật analytics để thực hiện luồng này.

### TC-03 — Xe chưa đủ điều kiện gửi duyệt

Điều kiện: M chưa được duyệt danh tính.

1. M mở `/settings/vehicles`, mở xe seed hoặc tạo xe theo thông tin ở TC-07.
2. Xem phần **Gửi duyệt xe**.

**Đạt:** có hướng dẫn xác minh danh tính và điện thoại; nút **Gửi duyệt xe** bị khóa. M vẫn được lưu thông tin xe nháp.

### TC-04 — Tạo và gửi hồ sơ danh tính

1. M mở `/settings/verification`, bấm **Tạo hồ sơ thử nghiệm**.
2. Kiểm tra trạng thái **Bản nháp**. Khi chưa có ảnh hoặc chưa xác nhận, **Gửi xét duyệt** phải bị khóa.
3. Tại **Thêm ảnh**, chọn `identity-demo.png`.
4. Chờ **Ảnh 1 đã sẵn sàng**. Tích xác nhận chỉ dùng dữ liệu tổng hợp.
5. Bấm **Gửi xét duyệt**, chờ hoàn tất rồi tải lại trang.
6. A1 vào `/admin/verifications`, chọn trạng thái **Chờ kết quả thử nghiệm**, mở hồ sơ vừa tạo. Ghi lại ID cuối URL để dùng các ca sau.

**Đạt:** hồ sơ ở **Chờ kết quả thử nghiệm**, tồn tại sau reload; danh tính chưa được cấp. Admin xem đúng hồ sơ của M. Nếu nhiều hồ sơ, đối chiếu ID/thành viên thay vì chọn ngẫu nhiên.

### TC-05 — Minh chứng riêng tư và kết quả sandbox

1. Trong hồ sơ ở A1, kiểm tra **Mở ảnh 1** bị khóa khi chưa nhập lý do.
2. Nhập lý do truy cập `Kiểm tra ảnh tổng hợp đợt 20261005-01`.
3. Bấm **Mở ảnh 1**, sau đó **Xem ảnh trong tab mới**. Kiểm tra đúng ảnh tổng hợp.
4. Quay lại hồ sơ, ở **Công cụ thử nghiệm local**, chọn **Đạt → chờ admin**, bấm **Chạy tình huống**.
5. Giữ trang mở và chờ worker xử lý. Kiểm tra trạng thái cả A1 và M.

**Đạt:** ảnh chỉ được yêu cầu sau thao tác chủ động; hồ sơ chuyển **Chờ quản trị viên duyệt**. Kết quả sandbox đạt chưa cấp quyền VERIFIED_MEMBER và chưa hiện danh tính được duyệt.

### TC-06 — Admin quyết định danh tính

1. A1 ở hồ sơ **Chờ quản trị viên duyệt**.
2. Chọn quyết định **Duyệt**; kiểm tra chưa có lý do/xác nhận thì **Ghi quyết định** bị khóa.
3. Nhập `Ảnh tổng hợp hợp lệ cho demo local`, tích **Tôi đã kiểm tra hồ sơ và xác nhận quyết định trên.**
4. Bấm **Ghi quyết định**.
5. Kiểm tra **Lịch sử xử lý** phía dưới.
6. M tải lại `/app` và `/settings/verification`.

**Đạt:** hồ sơ **Đã duyệt**, có lý do/lịch sử; dashboard hiển thị danh tính **Đã xác minh thử nghiệm**. Nếu chưa có xe được duyệt, quyền chủ xe vẫn chưa được cấp.

### TC-07 — Tạo và gửi xe

1. M vào `/settings/vehicles`.
2. Nhập: loại **Ô tô**, mẫu `Demo Sedan`, màu `Xanh`, biển `SYNTH-CAR-20261005-01`, số chỗ khách `3`.
3. Bấm **Lưu phương tiện**; ghi lại ID xe từ URL trang chi tiết.
4. Tải `vehicle-demo.png` ở phần minh chứng, chờ ảnh sẵn sàng.
5. Tích xác nhận kiểm tra thông tin xe và ảnh tổng hợp, bấm **Gửi duyệt xe**.
6. A1 vào `/admin/vehicles`, lọc **Chờ duyệt**, mở xe vừa gửi.

**Đạt:** xe từ **Bản nháp** sang **Chờ duyệt**; dữ liệu mẫu/màu/biển/số chỗ đúng. Không thể chỉnh sửa thông tin khi đang chờ; có thao tác rút hồ sơ.

### TC-08 — Duyệt xe và quyền chủ xe

1. A1 xem minh chứng với lý do truy cập, chọn **Duyệt**.
2. Nhập lý do `Xe tổng hợp và số chỗ phù hợp`, tích xác nhận, bấm **Ghi quyết định**.
3. M tải lại trang xe và `/app`.

**Đạt:** xe **Đã duyệt**, dashboard quyền chủ xe **Đã được cấp**. Danh tính và điện thoại vẫn hợp lệ. Lưu ý: Stage 5 chưa có tạo chuyến/booking/chat để demo.

### TC-09 — Tạo cộng đồng riêng cho đợt chạy

1. A1 vào `/admin/communities`, bấm **Tạo cộng đồng mới**.
2. Nhập tên `Demo School 20261005-01`, đường dẫn ngắn `demo-20261005-01`, loại **Trường học**, mô tả `Cộng đồng tổng hợp demo`.
3. Bấm **Lưu cộng đồng**, ghi ID cộng đồng từ liên kết lịch sử hoặc URL trang member.
4. M mở `/communities`; tìm tên trong trang hiện tại, chuyển trang nếu cần, mở cộng đồng.

**Đạt:** cộng đồng đang hoạt động, thông tin chính xác. Tìm kiếm hiện chỉ lọc dữ liệu của trang đang tải, không tìm toàn bộ danh mục trên server.

### TC-10 — Xin tham gia và duyệt membership

1. M ở chi tiết cộng đồng TC-09, nhập lý do `Xin tham gia để demo`, bấm **Xin gia nhập**.
2. M mở `/settings/communities`, kiểm tra **Chờ duyệt**.
3. A1 vào `/admin/memberships`, lọc **Chờ duyệt**, mở đúng hồ sơ; kiểm tra liên kết cộng đồng và lý do.
4. Chọn **Duyệt**, nhập lý do, tích xác nhận và **Ghi quyết định**.
5. M tải lại cộng đồng của tôi và mở chi tiết.

**Đạt:** membership **Đã duyệt**, có nút **Rời cộng đồng**. Không xuất hiện danh sách thành viên hoặc feed ngoài phạm vi Stage 5.

## 3. Kiểm thử ngoại lệ — chạy sau demo chính

Các ca thu hồi/sửa/rời thay đổi dữ liệu demo. Chạy theo thứ tự hoặc dùng cộng đồng/xe mới. Không xóa database để chuyển ca. Với trạng thái không đúng tiền điều kiện, ghi **Blocked** thay vì đoán kết quả.

### TC-11 — Sửa xe đã duyệt thu hồi hiệu lực

1. M mở xe TC-08, đổi màu thành `Trắng`.
2. Kiểm tra **Lưu phương tiện** bị khóa cho đến khi tích xác nhận việc xét duyệt lại.
3. Tích xác nhận và lưu.
4. Tải lại `/app`.
5. Tải minh chứng mới, gửi lại; A1 duyệt lại để phục hồi dữ liệu cho ca tiếp theo.

**Đạt:** xe trở về **Bản nháp** ngay khi sửa; nếu đây là xe được duyệt duy nhất thì mất quyền chủ xe. Nếu còn xe khác đã duyệt, quyền chủ xe có thể vẫn còn. Duyệt lại khôi phục quyền khi danh tính/điện thoại vẫn hợp lệ.

### TC-12 — Rút, từ chối và gửi lại xe

1. Tạo xe mới với biển khác; gửi duyệt, rồi M chọn **Rút hồ sơ xe** → **Xác nhận rút hồ sơ xe**.
2. Kiểm tra xe về **Bản nháp**. Tải ảnh lên lại và gửi tiếp.
3. A1 chọn **Từ chối**, ghi `Cần bổ sung dữ liệu tổng hợp`, xác nhận quyết định.
4. M xem lý do, sửa/lưu xe để trở về nháp, tải ảnh mới rồi gửi lại.

**Đạt:** mỗi trạng thái đúng thứ tự; lý do hiển thị cho M. Không dùng file ID của lần gửi trước cho lần mới.

### TC-13 — Thu hồi xe và lưu trữ

1. A1 mở một xe **Đã duyệt**, chọn **Thu hồi**, nhập lý do và xác nhận.
2. M kiểm tra xe **Đã thu hồi** và quyền chủ xe (mất nếu không còn xe đã duyệt khác).
3. M bấm **Lưu trữ xe**, đọc cảnh báo, xác nhận.

**Đạt:** xe **Đã lưu trữ**, không còn form chỉnh sửa/gửi duyệt. Dùng xe khác nếu muốn demo tiếp.

### TC-14 — Hủy yêu cầu cộng đồng

1. A1 tạo một cộng đồng mới dành cho ca này.
2. M xin gia nhập; khi **Chờ duyệt**, bấm **Hủy yêu cầu**, xác nhận.
3. Tải lại, kiểm tra **Đã hủy**; xin lại.

**Đạt:** hủy thành công; hủy yêu cầu pending không bị áp chờ 7 ngày như trường hợp đã tham gia rồi rời.

### TC-15 — Rời/từ chối/thu hồi và cooldown

1. Với cộng đồng TC-10 đã duyệt, M bấm **Rời cộng đồng**, xác nhận.
2. Kiểm tra **Đã rời** và ngày được phép xin lại; nút xin gia nhập bị khóa trong thời gian chờ.
3. Dùng cộng đồng mới thứ hai: M xin vào, A1 **Từ chối** có lý do.
4. Dùng cộng đồng mới thứ ba: duyệt M, sau đó A1 **Thu hồi**.

**Đạt:** trạng thái/lý do đúng; cả rời, từ chối, thu hồi đều có cooldown 7 ngày. Không chỉnh đồng hồ máy hoặc database để giả lập đã hết 7 ngày trong demo này.

### TC-16 — Lưu trữ cộng đồng nhưng member vẫn rời được

1. Tạo cộng đồng mới, xin và duyệt membership M.
2. A1 vào `/admin/communities`, chọn **Lưu trữ cộng đồng**, xác nhận.
3. M tải lại `/communities`: cộng đồng không còn trong danh mục hoạt động.
4. M vào `/settings/communities`, mở membership cộng đồng vừa lưu trữ.
5. Dù chi tiết cộng đồng không còn khả dụng, bấm **Rời cộng đồng**, xác nhận.

**Đạt:** không thể xin mới vào cộng đồng ngừng hoạt động; membership có sẵn vẫn rời được. Bản ghi membership có thể còn trạng thái đã duyệt trước khi rời, nhưng không còn cấp quyền vào cộng đồng đã lưu trữ.

### TC-17 — Thu hồi danh tính, thử fail/expiry/retry

Chạy gần cuối vì làm mất quyền kinh doanh của M.

1. A1 lọc danh tính **Đã duyệt**, mở hồ sơ M, chọn **Thu hồi**, ghi lý do và xác nhận.
2. M tải lại `/app`: danh tính không còn được duyệt, quyền chủ xe mất dù từng có xe đã duyệt.
3. M tạo hồ sơ mới, tải ảnh mới và gửi. A1 chạy **Không đạt**.
4. M thấy **Bị từ chối**, có thể tạo attempt mới.
5. Tạo/gửi attempt mới, A1 chạy **Hết hạn**; M thấy **Đã hết hạn**, có thể tạo lại.
6. Tạo/gửi attempt mới, A1 chạy **Tiếp tục chờ**; hồ sơ phải còn chờ. Chọn **Đạt → chờ admin**, bấm **Gửi lại tình huống**, chờ chuyển sang xét duyệt.
7. A1 **Từ chối** với lý do dễ nhận biết; M kiểm tra lý do rồi tạo/gửi attempt mới.
8. Nếu muốn kiểm tra sweep, ở attempt pending mới chọn **Không có phản hồi**, bấm **Chạy tình huống**, chờ khoảng 1–2 phút và tải lại.
9. Muốn kết thúc demo với tài khoản dùng được, tạo/gửi attempt cuối, chạy đạt và admin duyệt lại.

**Đạt:** mock đạt không tự duyệt; fail/expired/cancelled/revoked không bị hồi sinh bởi thao tác retry UI. Công cụ sandbox chỉ hiện khi đang chờ provider. Không coi nút chạy thành công là bằng chứng worker đã xử lý xong.

### TC-18 — Hủy hồ sơ danh tính

Điều kiện: danh tính chưa được duyệt, có hồ sơ nháp hoặc pending.

1. M mở hồ sơ, chọn **Hủy hồ sơ**, đọc cảnh báo và xác nhận.
2. Tải lại trang, kiểm tra **Đã hủy**.
3. Tạo hồ sơ mới, xác nhận attempt mới hoạt động và phải tải ảnh mới.

**Đạt:** hủy không cấp quyền; hồ sơ cũ không còn được xử lý như hồ sơ hiện hành.

### TC-19 — Cấm tự xét duyệt

1. A1 chấp nhận điều khoản tại profile của chính mình.
2. A1 xin vào một cộng đồng mới bằng `/communities`.
3. A1 vào `/admin/memberships`, mở yêu cầu của chính mình.
4. A2 mở cùng URL và kiểm tra form quyết định.

**Đạt:** A1 thấy thông báo không thể tự xét duyệt, không có nút ghi quyết định. A2 được quyết định với lý do/xác nhận. Đây là ca nhanh để kiểm tra self-review, không cần eKYC admin.

### TC-20 — Hai admin xử lý cùng hồ sơ

1. Tạo một membership M đang chờ duyệt trong cộng đồng mới.
2. A1 và A2 mở cùng chi tiết, chuẩn bị quyết định và lý do, tích xác nhận ở cả hai.
3. A1 ghi quyết định trước, A2 ghi ngay sau trước lần poll kế tiếp.
4. Quan sát A2, tải lịch sử xử lý.

**Đạt:** không ghi hai quyết định trái ngược. Nếu A2 giữ phiên bản cũ, phải thấy thông báo hồ sơ đã thay đổi, dữ liệu tải lại, xác nhận cũ bị bỏ; không tự gửi lại. Nếu poll đã cập nhật A2 trước khi bấm thì form đổi trạng thái là đúng nhưng chưa chứng minh nhánh 409; ghi **chưa tái hiện 409**, chạy lại với hồ sơ mới. Test tự động UI có ca 409 xác định; kiểm thử tranh chấp backend thật nằm trong suite integration.

### TC-21 — File lỗi và liên kết hết hạn

1. Ở hồ sơ nháp, thử chọn PDF/SVG (bộ chọn có thể lọc sẵn), ảnh lớn hơn 5 MiB, hoặc file văn bản đổi đuôi `.png`.
2. Kiểm tra lỗi; không được thêm vào danh sách ảnh sẵn sàng. File giả PNG phải bị backend kiểm tra bytes từ chối.
3. Tải ba ảnh hợp lệ; không được thêm ảnh thứ tư nếu chưa bỏ chọn một ảnh.
4. A1 cấp link xem ảnh của hồ sơ đang xét; chờ hơn 60 giây, yêu cầu lại URL đó bằng tab mới và tắt cache trong DevTools nếu cần.
5. Quay lại hồ sơ, nhập lý do và bấm mở ảnh để cấp URL mới.

**Đạt:** validation không bị vượt chỉ bằng phần mở rộng; URL cũ không cấp lượt tải mới sau hết hạn, URL mới hoạt động. Ảnh đã tải sẵn/cache vẫn có thể hiển thị sau 60 giây, không dùng việc tab cũ còn ảnh để kết luận lỗi. Signed URL còn hạn là bearer link, không kỳ vọng mở ẩn danh bị chặn nếu vẫn giữ nguyên chữ ký.

### TC-22 — Hồ sơ công khai và thông tin xe

1. M có ít nhất một xe đã duyệt, tại `/settings/profile` chọn **Hiển thị hồ sơ → Thành viên đã đăng nhập**, bật tìm theo tên rồi **Lưu quyền riêng tư**.
2. A1 vào `/people`, tìm đúng tên M và mở hồ sơ.
3. Kiểm tra phần phương tiện: chỉ loại xe, mẫu, màu, số chỗ khách; không có biển số hoặc ảnh minh chứng/lý do xét duyệt.
4. M chuyển hồ sơ thành **Chỉ mình tôi**, lưu.
5. A1 tìm/mở lại hồ sơ bằng lượt đọc mới.

**Đạt:** không đọc được dữ liệu riêng tư qua profile. Nếu không tìm thấy ở bước 2, kiểm tra tùy chọn tìm kiếm trước khi kết luận lỗi.

### TC-23 — Responsive, bàn phím và dữ liệu sau reload

1. M/A1 dùng DevTools chế độ thiết bị, đặt chiều rộng 390 px.
2. Mở xác minh, chi tiết xe, cộng đồng; A1 mở queue và chi tiết duyệt.
3. Dùng Tab/Shift+Tab tới input, checkbox, nút; dùng Enter/Space thực hiện thao tác phù hợp.
4. Thử reload trang đã lưu để kiểm tra dữ liệu server còn nguyên.

**Đạt:** không tràn ngang, nội dung không che nút, có focus dễ thấy, có thông báo loading/lỗi và không thể bấm lặp khi đang xử lý. Ảnh mới tải nhưng chưa gửi có thể phải chọn/tải lại sau reload vì UI không lưu danh sách lựa chọn vào localStorage.

## 4. Khi một bước không đạt

| Hiện tượng                     | Kiểm tra tiếp                                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| Không có tài khoản/quyền admin | Seed đã chạy chưa; chọn đúng mock account; đăng xuất/đăng nhập lại                           |
| Lỗi consent                    | Lưu hai lựa chọn bắt buộc tại profile đúng tài khoản đang upload                             |
| Không thấy công cụ sandbox     | Hồ sơ phải chờ provider; APP_ENV local/test, EKYC_PROVIDER mock; restart dev nếu vừa đổi env |
| Chạy đạt nhưng vẫn chờ         | Kiểm tra worker trong terminal, Redis/Mongo/API callback; chờ vài chu kỳ rồi reload          |
| Không thấy hồ sơ trong queue   | Kiểm tra filter trạng thái, trang cursor và ID hồ sơ                                         |
| Không gửi được xe              | Điện thoại và danh tính còn hiệu lực, xe nháp, có ảnh mới và đã xác nhận                     |
| Lỗi phiên bản                  | Đọc dữ liệu mới; không bấm gửi liên tục; quyết định lại chỉ nếu vẫn còn phù hợp              |
| 429                            | Chờ thời gian thông báo; cooldown membership là 7 ngày, khác giới hạn thao tác nhanh         |
| Upload lỗi                     | MinIO hoạt động, dùng localhost:3000, file đúng giới hạn, xem request complete trong Network |
| Không kết nối dịch vụ          | Terminal phụ chạy `corepack pnpm infra:logs`; không reset volumes để chữa lỗi thông thường   |

Khi báo lỗi, ghi: mã ca, tài khoản/vai trò, đường dẫn, tiền điều kiện, thao tác, kết quả mong đợi, thực tế, thời điểm, HTTP status/error code/requestId nếu có. Không đưa cookie, token hoặc URL minh chứng còn chữ ký vào báo cáo. Dùng dữ liệu tổng hợp trong ảnh chụp.

## 5. Mẫu ghi kết quả

Copy bảng này cho từng đợt chạy; PASS chỉ khi đã thực hiện và đối chiếu kết quả.

| Mã ca | Trạng thái (Chưa chạy/PASS/FAIL/Blocked) | Thực tế / mã lỗi | Bằng chứng | Người chạy / thời điểm |
| ----- | ---------------------------------------- | ---------------- | ---------- | ---------------------- |
| TC-01 | Chưa chạy                                |                  |            |                        |
| TC-02 | Chưa chạy                                |                  |            |                        |
| TC-03 | Chưa chạy                                |                  |            |                        |
| TC-04 | Chưa chạy                                |                  |            |                        |
| TC-05 | Chưa chạy                                |                  |            |                        |
| TC-06 | Chưa chạy                                |                  |            |                        |
| TC-07 | Chưa chạy                                |                  |            |                        |
| TC-08 | Chưa chạy                                |                  |            |                        |
| TC-09 | Chưa chạy                                |                  |            |                        |
| TC-10 | Chưa chạy                                |                  |            |                        |
| TC-11 | Chưa chạy                                |                  |            |                        |
| TC-12 | Chưa chạy                                |                  |            |                        |
| TC-13 | Chưa chạy                                |                  |            |                        |
| TC-14 | Chưa chạy                                |                  |            |                        |
| TC-15 | Chưa chạy                                |                  |            |                        |
| TC-16 | Chưa chạy                                |                  |            |                        |
| TC-17 | Chưa chạy                                |                  |            |                        |
| TC-18 | Chưa chạy                                |                  |            |                        |
| TC-19 | Chưa chạy                                |                  |            |                        |
| TC-20 | Chưa chạy                                |                  |            |                        |
| TC-21 | Chưa chạy                                |                  |            |                        |
| TC-22 | Chưa chạy                                |                  |            |                        |
| TC-23 | Chưa chạy                                |                  |            |                        |

## 6. Kiểm tra tự động bổ sung

Chạy terminal riêng ở root repo:

```powershell
corepack pnpm --filter @dike/web test
corepack pnpm test:e2e:stage5-ui
corepack pnpm test:integration
```

Suite stage5-ui dùng API giả lập và web riêng cổng 3100, không chứng minh backend thật. Integration cần Mongo replica set/Redis/MinIO, dùng dữ liệu test riêng. Nếu thiếu Chromium: `corepack pnpm --filter @dike/web exec playwright install chromium`.

Để chạy `corepack pnpm run ci` (có build), nên dừng dev trước và chạy lại dev sau, tránh build/dev cùng ghi output Next. Không cần chạy CI trong lúc trình bày demo.

Nghiệm thu local cần luồng chính đạt, không có lỗi mất quyền/đọc minh chứng sai, có kết quả integration thực chạy và lưu các ca chưa đạt. Không suy ra sẵn sàng production từ demo local.
