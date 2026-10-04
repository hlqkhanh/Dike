# Dike — Kế hoạch phát triển nền tảng đi chung xe đến production pilot

Ngày cập nhật: 01/10/2026  
Trạng thái: Kế hoạch hợp nhất — đặc tả sản phẩm, kiến trúc production và lộ trình triển khai  
Đội ngũ: 3 thành viên  
Công nghệ: Next.js, React, NestJS, TypeScript, MongoDB, Redis và React Native

Tài liệu này là nguồn kế hoạch duy nhất của dự án. Dự án hiện được triển khai theo hướng **greenfield**: toàn bộ source prototype cũ đã bị xóa có chủ đích, không có code hoặc dữ liệu legacy cần giữ tương thích hay migrate. Đặc tả nghiệp vụ được rút ra từ quá trình thử nghiệm trước đây; kiến trúc, hạ tầng và lộ trình production trong tài liệu này là quyết định hiện hành.

## 1. Tầm nhìn và mục tiêu

Dike kết nối người có xe đang có nhu cầu di chuyển với người cần đi nhờ có tuyến đường và thời gian phù hợp, giúp chia sẻ chi phí nhiên liệu và tìm bạn đồng hành.

Sản phẩm kết hợp bốn thành phần:

1. **Bảng tin cộng đồng:** cả người cần người chở và người muốn chở thêm người đều có thể đăng bài.
2. **Lịch cá nhân:** lưu thời khóa biểu hoặc lịch làm việc để điền sẵn nhu cầu, tìm chuyến và tạo bài nhanh.
3. **Ghép và quản lý chuyến:** tìm người phù hợp, gửi đề nghị, xác nhận, gặp nhau, hoàn thành và đánh giá.
4. **Kết nối bạn bè:** xem profile, kết bạn, ưu tiên bài/lịch được chia sẻ, nhắn tin trực tiếp và đánh giá hai chiều sau chuyến.

Luồng trải nghiệm chính:

`Thiết lập lịch → Xem nhu cầu sắp tới → Tìm hoặc đăng bài → Gửi đề nghị → Hai bên đồng ý → Đi chung → Chia chi phí và đánh giá`

Người dùng không cần có lịch thường tuần vẫn có thể đăng nhu cầu một lần hoặc tìm chuyến tức thì.

### 1.1. Quyết định đã chốt

| Hạng mục           | Quyết định                                                                            |
| ------------------ | ------------------------------------------------------------------------------------- |
| Nền tảng đầu tiên  | Web responsive, tối ưu màn hình điện thoại                                            |
| Web                | Next.js và React, dùng TypeScript                                                     |
| Backend            | NestJS, API riêng để mobile dùng lại                                                  |
| Đối tượng          | Người đi học, đi làm và cộng đồng rộng hơn                                            |
| Phương tiện        | Xe máy và ô tô cá nhân                                                                |
| Địa lý             | Thiết kế hỗ trợ Việt Nam; chạy thật theo từng khu vực                                 |
| Cộng đồng          | Trường học, công ty hoặc nhóm được quản trị viên duyệt                                |
| Bạn bè             | Kết bạn hai chiều; ưu tiên nội dung được phép xem của bạn bè                          |
| Nhắn tin           | Tin nhắn trực tiếp giữa user và chat riêng theo booking                               |
| Đánh giá           | Khách đánh giá tài xế và tài xế đánh giá khách; điểm tách theo vai trò                |
| Đặt chuyến         | Hẹn trước và tức thì, có sự đồng ý của hai bên                                        |
| Chi phí            | Gợi ý mức đóng góp; thanh toán trực tiếp giữa người dùng                              |
| Xác minh           | Cả người đi nhờ và chủ xe; chủ xe cần hồ sơ phương tiện                               |
| Mục tiêu phát hành | Production pilot theo đợt, từ nội bộ đến tối đa khoảng 500 người                      |
| Database           | MongoDB Atlas; MongoDB replica set trong local/test để hỗ trợ transaction             |
| Đăng nhập          | Google trước, thu số điện thoại sau; OTP bắt buộc trước production pilot              |
| Dịch vụ ngoài      | Goong qua adapter, eKYC sandbox khi phát triển, Cloudflare R2 cho file                |
| Triển khai         | Web trên Vercel; API, worker, cron và Redis-compatible store trên Render              |
| Mobile             | React Native + Expo sau khi backend và web ổn định; dùng chung API client và contract |

### 1.2. Phân biệt môi trường phát triển và production pilot

Local/test được phép dùng OTP giả, eKYC sandbox, tuyến cố định và dữ liệu tổng hợp, nhưng phải có nhãn rõ và không được dùng giấy tờ người thật. Staging dùng tích hợp sandbox gần production nhất có thể. Production phải từ chối khởi động nếu fake provider hoặc chế độ demo còn bật.

Pilot chỉ được mở sau khi auth, OTP, phân quyền, transaction chống trùng chỗ, backup/restore, monitoring, quy trình vận hành và chính sách dữ liệu cá nhân đã đạt điều kiện nghiệm thu. GPS nền chỉ được cam kết trên mobile sau khi kiểm thử Android/iOS thực tế; web không cam kết theo dõi khi trình duyệt đã đóng hoặc thiết bị bị khóa.

## 2. Phạm vi và ưu tiên

### 2.1. Phải có trước production pilot

- Tài khoản, hồ sơ, eKYC sandbox ở development/staging và quy trình xác minh được phê duyệt trước production pilot.
- Lịch thường tuần, ngoại lệ theo ngày và gợi ý nhu cầu đi/về.
- Bảng tin hai loại bài: tìm người chở và tìm người đi cùng.
- Đăng, sửa, đóng, lưu, chia sẻ liên kết và báo cáo bài.
- Tìm theo tuyến, thời gian, phương tiện và cộng đồng.
- Đề nghị hai chiều, chấp nhận, từ chối, hết hạn và tạo booking.
- Hẹn trước và đi ngay khi người dùng đang mở web.
- Quản lý chỗ, mã lên xe, xuống xe, hoàn thành, hủy và kết thúc sớm.
- Kết bạn, profile giữa các user, chia sẻ lịch cho bạn bè và ưu tiên nội dung bạn bè.
- Nhắn tin trực tiếp, yêu cầu nhắn tin từ người lạ, chat riêng theo booking và thông báo trong ứng dụng.
- Gợi ý chi phí và xác nhận thanh toán trực tiếp.
- Đánh giá hai chiều tài xế–khách, chặn, báo cáo và giao diện quản trị.
- Kiểm thử, dữ liệu demo, tài liệu cài đặt và API.

### 2.2. Ngoài phạm vi production pilot đầu tiên

- Like, follow một chiều, bình luận công khai, bảng tin giải trí và thuật toán tương tác nâng cao; kết bạn hai chiều và ưu tiên bạn bè thuộc bản đầu.
- OCR ảnh thời khóa biểu, nhập lịch tự động từ trường hoặc đồng bộ lịch ngoài.
- Tự đăng bài định kỳ, tự nhận chuyến và tự điều phối chủ xe.
- GPS nền, push mobile và điều hướng tích hợp sâu trên điện thoại.
- Ví, thu tiền qua nền tảng, hoàn tiền và đối soát ngân hàng.
- Đặt hộ, trẻ em đi một mình, hành khách ẩn danh.
- Tái sử dụng một chỗ cho nhiều người ở các đoạn khác nhau trong cùng chuyến.
- Bán gói doanh nghiệp, mở nhiều quốc gia, tối ưu điều phối quy mô lớn.

## 3. Người dùng, tài khoản và cộng đồng

### 3.1. Vai trò

| Vai trò                | Khả năng                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| Khách chưa đăng nhập   | Xem giới thiệu và bài mẫu, không xem dữ liệu di chuyển thật                                       |
| Thành viên             | Quản lý hồ sơ/lịch, xem profile, kết bạn, nhắn tin theo quyền người nhận, xem bảng tin và lưu bài |
| Thành viên đã xác minh | Đăng nhu cầu đi nhờ, gửi/nhận đề nghị, tham gia chuyến                                            |
| Chủ xe đã được duyệt   | Đăng chuyến, đăng bài có xe, đề nghị chở, nhận người đi cùng                                      |
| Quản trị viên          | Duyệt hồ sơ và cộng đồng, xử lý báo cáo, khóa tài khoản, cấu hình                                 |

Một tài khoản có thể vừa là người đi nhờ vừa là chủ xe. Bản đầu phục vụ người từ 18 tuổi.

### 3.2. Hồ sơ

- Tên hiển thị, ảnh đại diện, giới thiệu ngắn, trạng thái xác minh.
- Cộng đồng đã tham gia và thống kê chuyến hoàn thành; điểm/số lượt đánh giá tách thành **Khi làm tài xế** và **Khi đi nhờ**.
- Phương tiện có phần giới thiệu được xem trên profile; giấy tờ và hồ sơ duyệt chỉ chủ tài khoản/quản trị viên có quyền xem.
- Người dùng đăng nhập mở profile từ tên/ảnh trên bài, tìm kiếm tên hiển thị hoặc liên kết profile. Kết quả tìm kiếm chỉ có thông tin cơ bản, không tra cứu bằng số điện thoại trong bản đầu.
- Profile có phần giới thiệu, bài đăng, đánh giá theo vai trò và lịch được chia sẻ; nút **Kết bạn/Đã là bạn bè**, **Nhắn tin**, **Báo cáo/Chặn** tùy trạng thái.
- Lịch mặc định riêng tư; từng lịch có thể chia sẻ cho bạn bè theo mục 5.5. Profile chỉ hiển thị dữ liệu người xem được phép đọc, không hiện lịch sử tuyến đường hoặc địa chỉ nhà.
- Không công khai danh sách bạn bè trong bản đầu; chủ tài khoản quản lý danh sách của mình.

Xác minh có trạng thái `NOT_SUBMITTED`, `PENDING`, `VERIFIED`, `REJECTED`. Trong môi trường thử, giao diện dùng nhãn “Xác minh thử nghiệm”.

### 3.3. Cộng đồng

- Người dùng xin tham gia trường/công ty; quản trị viên duyệt trong bản đầu.
- Bài và chuyến có một phạm vi `PUBLIC`, `COMMUNITY` hoặc `FRIENDS`; bài có xe kế thừa phạm vi của chuyến.
- `PUBLIC` nghĩa là thành viên đăng nhập được xem theo chính sách dữ liệu, không phải công khai hành trình cho công cụ tìm kiếm.
- Người ngoài cộng đồng không được truy cập bài/chuyến riêng, kể cả qua URL, API hoặc Socket.IO.
- Chưa hỗ trợ người dùng tự tạo cộng đồng không cần duyệt.

### 3.4. Kết bạn

- Gửi, nhận, chấp nhận, từ chối, rút lời mời và hủy kết bạn. Chỉ `ACCEPTED` mới được coi là bạn bè; lời mời đang chờ không cấp quyền xem lịch/bài dành cho bạn bè.
- Mỗi cặp user có một quan hệ duy nhất, không phân biệt thứ tự ID; lưu người gửi để xác định người được chấp nhận. Trạng thái gồm `PENDING`, `ACCEPTED`, `DECLINED`, `CANCELLED`, `REMOVED`.
- Hai lời mời ngược chiều đồng thời không tự kết bạn; trả về lời mời đang có để người nhận chủ động chấp nhận. Không tự kết bạn với chính mình.
- Sau từ chối/hủy kết bạn, chờ 7 ngày trước khi gửi lại; giới hạn gửi lời mời để chống làm phiền.
- Chặn có ưu tiên cao nhất: kết thúc quan hệ, hủy lời mời chờ, ngăn lời mời mới và ẩn profile xã hội/nội dung hai phía. Thông tin cần thiết của booking cũ vẫn theo quyền nghiệp vụ.
- Hủy kết bạn/đổi quyền lịch thu hồi truy cập lịch và bài `FRIENDS` ở lần đọc tiếp theo, xóa kết quả cache liên quan và báo client gỡ nội dung đang hiển thị; không thể thu hồi ảnh chụp do người xem đã tự lưu.
- Bạn bè không tự được quyền xem bài `COMMUNITY` nếu chưa là thành viên; quan hệ bạn bè không bỏ qua xác minh, số chỗ, giá hoặc bước đồng ý chuyến.

## 4. Bảng tin tìm bạn đồng hành

### 4.1. Hai loại bài

| Loại                             | Nội dung                                                                  | CTA chính   |
| -------------------------------- | ------------------------------------------------------------------------- | ----------- |
| `NEED_RIDE` — Tìm người chở      | Điểm đón/xuống, ngày, giờ đi hoặc hạn đến, phương tiện mong muốn, ghi chú | Đề nghị chở |
| `OFFER_RIDE` — Tìm người đi cùng | Tuyến chủ xe, giờ khởi hành, phương tiện, chỗ còn lại, chi phí            | Xin đi cùng |

Thẻ bài theo hướng mẫu tham khảo: ảnh đại diện và tên ở đầu, nhãn loại nhu cầu, điểm đi/đến, ngày giờ, chỗ trống nếu có, ghi chú ngắn và nút hành động nổi bật.

Ví dụ nhu cầu:

> Minh Anh · Tìm người chở  
> Ký túc xá → Đại học FPT  
> Thứ Hai, cần đến trước 07:15  
> Mình có thể ra cổng ký túc xá lúc 06:40.  
> **Đề nghị chở**

Ví dụ có xe:

> Hoàng Nam · Tìm người đi cùng  
> Khu dân cư A → Đại học FPT  
> Thứ Hai, xuất phát 06:45 · Xe máy · Còn 1 chỗ  
> Tìm bạn cùng tuyến chia tiền xăng.  
> **Xin đi cùng**

### 4.2. Tương tác và sắp xếp

- Bốn tab: **Phù hợp với bạn**, **Bạn bè**, **Cộng đồng của bạn**, **Mới nhất**.
- Lọc ngày, giờ, loại nhu cầu, phương tiện, cộng đồng và tuyến.
- Tab phù hợp lấy nhu cầu do người dùng chọn từ lịch hoặc nhập thủ công; không tự đoán một lịch khi có nhiều lựa chọn.
- Sau khi lọc quyền và các ràng buộc tuyến/giờ, tab phù hợp xếp nhóm bài bạn bè trước, rồi mới xếp theo độ phù hợp trong từng nhóm. Không đưa bài sai tuyến hoặc trễ giờ lên chỉ vì là bạn bè.
- Tab Bạn bè có hai vùng **Bài đăng** và **Lịch sắp tới** trong 7 ngày; lịch chỉ lấy những mục đã chia sẻ, sắp theo thời gian gần nhất, có bộ lọc ngày và bạn bè. Lịch không phải bài đang tìm xe và không được hiển thị như một đề nghị sẵn sàng.
- Tab mới nhất chỉ đưa bài còn hiệu lực lên kết quả tìm kiếm; bài cũ vẫn xem được trong lịch sử của chủ bài.
- Cho phép lưu bài, sao chép liên kết, báo cáo và chặn người đăng.
- Liên kết chia sẻ vẫn yêu cầu đăng nhập và quyền cộng đồng; bản xem trước không chứa địa chỉ chính xác.
- Mở profile hoặc nhắn tin trực tiếp từ thẻ bài theo quyền người nhận; không cần có booking. Đề nghị vẫn đi qua luồng nghiệp vụ riêng, không coi đồng ý bằng chat là booking.

### 4.3. Vòng đời bài

`DRAFT → OPEN → MATCHED/CLOSED/EXPIRED/CANCELLED`

- Nhu cầu đi nhờ đã tạo booking: chuyển `MATCHED`, hết hiệu lực các đề nghị khác.
- Bài có xe hết chỗ: chuyển `MATCHED`; nếu chỗ trống trở lại trước khởi hành và chuyến vẫn mở, hệ thống cập nhật lại trạng thái.
- Chủ bài có thể đóng bài; thao tác này không tự hủy booking đã nhận.
- Khi có đề nghị đang chờ, sửa tuyến/giờ/giá làm hết hiệu lực các đề nghị cũ và yêu cầu gửi lại theo phiên bản mới.
- Khi đã có booking, không sửa điều kiện ảnh hưởng booking; phải hủy theo quy trình rồi tạo nhu cầu/chuyến mới.
- Bài hết thời gian đi hợp lệ phải hết hạn; bài cần đến trước dùng mốc khởi hành muộn nhất do định tuyến tính ra.
- Bài và chuyến có xe dùng chung số chỗ/giá từ chuyến, không lưu các bản sao có thể lệch nhau.

## 5. Lịch thường tuần và nhu cầu di chuyển

### 5.1. Nhập lịch

Mỗi lịch gồm tên, ngày trong tuần, ngày bắt đầu/kết thúc áp dụng, địa điểm, giờ bắt đầu/kết thúc, điểm xuất phát thường dùng, khoảng đệm đến sớm, chiều cần đi và vai trò mặc định.

Ví dụ: học thứ Hai/Tư/Sáu, 07:30–11:30, tại trường, xuất phát từ ký túc xá, đến sớm 15 phút, cần đi nhờ cả hai chiều.

Tên môn học, phòng học và lớp là không bắt buộc. Bản đầu hỗ trợ sự kiện trong cùng ngày; lịch qua đêm nhập thành hai sự kiện để tránh quy tắc thời gian mơ hồ.

### 5.2. Sinh nhu cầu riêng tư

- Chiều đi: điểm xuất phát → nơi học/làm, cần đến trước giờ bắt đầu trừ khoảng đệm.
- Chiều về: nơi học/làm → điểm xuất phát, có thể đi từ giờ kết thúc.
- Chỉ tạo cho chiều người dùng đã bật; không mặc định người dùng về nhà sau mọi sự kiện.
- Nếu vai trò là “Chưa xác định”, hỏi chọn vai trò khi tạo bài.
- Sinh trước 14 ngày bằng job nền và bổ sung ngay khi người dùng xem ngày khác trong khoảng áp dụng.
- Khóa duy nhất theo chủ lịch, ngày và chiều giúp job chạy lại không sinh trùng.
- Mỗi nhu cầu lưu nguồn lịch và phiên bản; nhu cầu đã công khai hoặc được ghép giữ ảnh chụp thông tin đã cam kết.

### 5.3. Ngoại lệ

- Bỏ một ngày, đổi giờ, đổi địa điểm hoặc đổi điểm xuất phát riêng một ngày.
- Tạm dừng hoặc kết thúc lịch lặp.
- Thay đổi lịch cập nhật các nhu cầu riêng tư chưa được công khai.
- Bài/booking đã tồn tại được cảnh báo “Lịch gốc đã thay đổi”, không tự sửa hoặc hủy.
- Nếu nhiều lịch chồng nhau, hiển thị xung đột và cho chọn nhu cầu để tìm; không tự hợp nhất các tuyến.
- Chưa suy diễn đường đi từ sự kiện A sang sự kiện B; người dùng sửa tuyến thủ công khi không xuất phát từ địa điểm mặc định.

### 5.4. Trải nghiệm tìm nhanh

Trang đầu hiển thị: “Ngày mai bạn cần đến trường trước 07:15 — Ký túc xá → Trường”, kèm **Tìm người phù hợp** và **Đăng nhu cầu**.

- Tìm người phù hợp điền sẵn bộ lọc.
- Đăng nhu cầu mở bản nháp, người dùng kiểm tra rồi xác nhận công khai.
- Nếu đã có bài hoặc booking tương ứng, mở đối tượng đó thay vì tạo thêm.
- Người có xe dùng cùng luồng để tạo chuyến và bài `OFFER_RIDE`.
- Không tự đăng, gửi đề nghị hoặc nhận chuyến từ lịch.

### 5.5. Chia sẻ và ưu tiên lịch bạn bè

- Mỗi `ScheduleRule` có quyền `PRIVATE` (mặc định) hoặc `FRIENDS`; chủ lịch chủ động bật chia sẻ. Ngoại lệ kế thừa quyền lịch, ngày đã bỏ không xuất hiện với bạn bè.
- Bạn bè được xem ngày, khung giờ, nhãn hoạt động chung như học/làm, địa điểm công cộng hoặc khu vực đến và vai trò di chuyển nếu chủ lịch đã chọn. Không trả tên môn/phòng/lớp, địa chỉ nhà, điểm xuất phát riêng tư hoặc tọa độ chính xác.
- Trang chủ có khối **Lịch bạn bè phù hợp với bạn**; chỉ so sánh với nhu cầu đang được người xem chọn. Nếu chưa chọn nhu cầu, hiển thị lịch được chia sẻ theo thời gian và không khẳng định phù hợp tuyến.
- Từ lịch bạn bè có thể mở profile, nhắn tin hoặc xem bài liên quan nếu được phép. Nếu chưa có bài/chuyến, chỉ nhắn tin; người dùng phải tự tạo bài/chuyến và xác nhận đề nghị trước khi có booking.
- Đổi sang riêng tư, hủy kết bạn hoặc chặn phải thu hồi quyền qua profile, bảng tin, API và cache. Nội dung thông báo không sao chép chi tiết lịch để tránh lộ sau khi thu hồi.
- Quyền chia sẻ lịch độc lập với quyền bài: chia sẻ lịch không tự đăng bài, bài công khai không làm lịch gốc thành công khai.

## 6. Chuyến, đề nghị và booking

### 6.1. Tạo chuyến

Chủ xe nhập điểm xuất phát/đến, giờ đi, phương tiện, số chỗ, mức vòng đường tối đa, mức đóng góp/km, phạm vi cộng đồng và ghi chú.

- Xe máy tối đa một người đi nhờ.
- Ô tô có nhiều người; mỗi tài khoản đặt một chỗ.
- Mỗi chuyến một chiều; chiều về tạo chuyến khác.
- Mỗi chuyến gắn một phương tiện đã được duyệt.
- Chủ xe được có nhiều chuyến tương lai nhưng không được nhận lịch xung đột hoặc chạy hai chuyến cùng lúc.
- Chưa bán lại chỗ theo đoạn đường; số booking được nhận không vượt số chỗ cung cấp cho cả chuyến.

### 6.2. Hai chiều đề nghị

**Người đi nhờ chủ động:** xem bài có xe → chọn điểm đón/xuống → xem giá → xin đi cùng → chủ xe chấp nhận → tạo booking.

**Chủ xe chủ động:** xem bài cần chở → chọn chuyến đang có hoặc tạo chuyến → xem tác động lên tuyến → đề nghị chở với giờ đón/giá → người đi nhờ chấp nhận → tạo booking.

- Người gửi đề nghị đã đồng ý các điều kiện trong đề nghị; người nhận xác nhận để hoàn thành thỏa thuận.
- Đề nghị chưa giữ chỗ. Khi chấp nhận phải kiểm tra lại chỗ, tuyến, lịch, quyền và trạng thái xác minh.
- Không có bước chủ xe duyệt thêm sau khi người đi nhờ chấp nhận một đề nghị do chính chủ xe gửi.
- Mỗi cặp nhu cầu–chuyến chỉ có một đề nghị đang chờ; người đi nhờ có thể nhận đề nghị từ nhiều chủ xe.
- Bản đầu người đi nhờ chỉ chủ động gửi một đề nghị đang chờ cho mỗi nhu cầu; có thể rút để chọn người khác.
- Nhiều booking tương lai được phép nếu không trùng thời gian. Không giới hạn toàn tài khoản chỉ có một chuyến tương lai.
- Khoảng bận lấy từ giờ đón đến giờ xuống dự kiến cộng đệm 15 phút; chủ xe kiểm tra cả thời gian thực hiện chuyến.

### 6.3. Vòng đời

| Đối tượng | Trạng thái                                                                |
| --------- | ------------------------------------------------------------------------- |
| Đề nghị   | `PENDING`, `ACCEPTED`, `REJECTED`, `WITHDRAWN`, `EXPIRED`                 |
| Chuyến    | `DRAFT`, `OPEN`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `EXPIRED`       |
| Booking   | `ACCEPTED`, `BOARDED`, `COMPLETED`, `CANCELLED`, `NO_SHOW`, `ENDED_EARLY` |

Đề nghị được chấp nhận và booking phải được ghi trong cùng transaction. Booking không dùng trạng thái `PENDING` vì việc chờ được quản lý ở đề nghị.

Đề nghị hẹn trước hết hạn sau 24 giờ hoặc đến mốc khởi hành hợp lệ sớm hơn. Đề nghị tức thì hết hạn sau 60 giây. Quyết định dựa trên giờ server, không dựa vào đồng hồ trình duyệt.

### 6.4. Gặp nhau và hoàn thành

- Booking sinh mã lên xe riêng, chỉ người đi nhờ thấy; chủ xe nhập để xác nhận.
- Mã có giới hạn thử sai và không ghi vào log.
- Chủ xe ghi nhận từng người xuống xe riêng; kết thúc chuyến khi mọi người đã lên xe đều có trạng thái cuối.
- Bắt đầu chuyến đóng nhận người mới. Các điểm dừng đã nhận vẫn tiếp tục được phục vụ.
- Trước khi lên xe có thể hủy với lý do; không phạt tiền trong bản đầu.
- Chỉ ghi nhận vắng mặt sau giờ đón cộng 10 phút, có lý do và đường dẫn phản ánh; không tự phạt dựa trên một phía.
- Sau khi lên xe dùng kết thúc sớm, không hủy như chưa tham gia.
- Hủy chuyến hủy các booking chưa lên xe và thông báo; nếu có người đã lên xe phải kết thúc sớm có ghi nhận.
- Nhu cầu đi nhờ bị hủy booking không tự đăng lại; người dùng chọn “Tìm lại”.

## 7. Ghép tức thì và vị trí

Chủ xe bật “Sẵn sàng đi ngay” cho một chuyến có đích đến và dự kiến khởi hành trong 15 phút. Người đi nhờ chọn vị trí đón, đích đến và gửi yêu cầu đến ứng viên phù hợp.

- Heartbeat mỗi 15 giây; mất heartbeat trên 45 giây thì ẩn khỏi kết quả tức thì.
- Vị trí gửi tối đa một lần mỗi 5 giây khi có thay đổi; hiển thị thời điểm cập nhật.
- Vị trí quá 45 giây được ghi “Vị trí cũ”; không trình bày như vị trí hiện tại.
- Yêu cầu có 60 giây phản hồi; từ chối/hết hạn cho phép chọn người khác.
- Mất kết nối không tự hủy booking đã được nhận.
- Kết nối lại phải đọc trạng thái từ API trước khi tiếp tục thao tác.
- Từ chối GPS vẫn được chọn điểm thủ công; chủ xe không có vị trí cập nhật không được quảng bá là đang theo dõi trực tiếp.
- Không tự điều phối, tự chấp nhận hoặc nhận thêm người sau khi bắt đầu chuyến.

Web chỉ cam kết theo dõi khi trang đang hoạt động. Geolocation cần HTTPS và quyền người dùng; GPS nền được xử lý ở giai đoạn mobile. Tham khảo [MDN Geolocation](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API).

## 8. Thuật toán ghép và chi phí

### 8.1. Ghép tuyến

1. Lọc loại nhu cầu đối ứng, phương tiện, thời gian, xác minh, cộng đồng, chặn và số chỗ.
2. Lọc địa lý theo hành lang tuyến, không chỉ khoảng cách giữa hai người.
3. Kiểm tra điểm đón đứng trước điểm xuống theo chiều đi.
4. Tính phương án thêm điểm đón/xuống vào tuyến cùng các điểm dừng đã cam kết.
5. Kiểm tra giới hạn vòng đường, giờ cần đến và lịch xung đột.
6. Trong tập ứng viên hợp lệ, ưu tiên bạn bè đã chấp nhận, rồi thời gian tăng thêm, lệch giờ, cùng cộng đồng và đánh giá đúng vai trò; dùng ID để ổn định khi bằng điểm. Không có đánh giá hiển thị “Chưa có đánh giá”, không xem là 0 sao.

Với ô tô, thử chèn hai điểm mới và giữ thứ tự các điểm cũ; chọn phương án hợp lệ có thời gian tăng ít nhất. Kiểm tra giới hạn so với tuyến gốc để không cộng dồn các lần vòng đường vượt ngưỡng chủ xe chọn.

| Tham số ban đầu         | Mặc định                                        |
| ----------------------- | ----------------------------------------------- |
| Giờ mong muốn khởi hành | ±30 phút; người dùng có thể thu hẹp             |
| Nhu cầu đến trước       | Là ràng buộc cứng, không cộng thêm dung sai trễ |
| Hành lang ứng viên      | 2 km quanh tuyến                                |
| Vòng thêm               | Tối đa 3 km và 10 phút                          |
| Tính tuyến chi tiết     | Tối đa 20 ứng viên sau lọc                      |

Tất cả mức mặc định là cấu hình sản phẩm cần hiệu chỉnh khi pilot, không phải số liệu đã kiểm chứng ngoài thực tế. Không đủ dữ liệu định tuyến thì không khẳng định ghép phù hợp.

### 8.2. Mức đóng góp

`Mức gợi ý/km = Giá nhiên liệu × Tiêu hao lít/100 km ÷ 100 ÷ (Số chỗ đi nhờ cung cấp + 1)`

`Khoản đóng góp = Quãng đường đi chung × Mức đóng góp/km đã chọn`

- Quản trị viên cấu hình giá nhiên liệu và mức tiêu hao tham khảo theo loại xe.
- Chủ xe chọn từ miễn phí đến mức gợi ý; tiền cuối làm tròn đến 1.000 đồng, trường hợp đúng nửa làm tròn lên.
- Báo giá chốt trên đề nghị; chấp nhận không tự thay giá. Nếu tuyến đổi làm điều kiện không còn đúng, đề nghị cũ hết hiệu lực và phải gửi lại.
- Thêm/bớt người không tự tăng khoản đã chốt với người còn lại.
- Chưa có phụ thu cầu đường, gửi xe hoặc phí nền tảng.
- Đây là quy tắc thử nghiệm chia chi phí, cần rà soát trước khi chạy thật; không dùng công thức để kết luận phân loại pháp lý.

Ví dụ dữ liệu giả định: tiêu hao 2 lít/100 km, nhiên liệu 25.000 đồng/lít, một chỗ đi nhờ ⇒ 250 đồng/km; đi chung 10 km ⇒ 3.000 đồng sau làm tròn.

Người đi nhờ đánh dấu “Đã trả”, chủ xe xác nhận “Đã nhận”. Lưu hai xác nhận riêng, không coi đó là kết quả xác thực của ngân hàng. Hoàn thành chuyến không bị chặn bởi xác nhận thanh toán.

## 9. Chat, tin cậy và quyền riêng tư

### 9.1. Chat và thông báo

- Hai loại cuộc trò chuyện: `DIRECT` duy nhất cho mỗi cặp user và `BOOKING` riêng cho mỗi booking; không trộn lịch sử hoặc tạo nhóm lộ thông tin giữa hành khách.
- Bạn bè nhắn trực tiếp. Người chưa kết bạn được gửi một lời nhắn mở đầu vào **Tin nhắn chờ**; người nhận chấp nhận mới mở chat hai chiều. Mặc định cho phép tin nhắn chờ; cài đặt “Chỉ bạn bè” chặn yêu cầu mới của người lạ.
- Yêu cầu nhắn tin có trạng thái `PENDING`, `ACCEPTED`, `DECLINED`; từ chối thì không được gửi lại trong 7 ngày. Chấp nhận tin nhắn không tự kết bạn; chấp nhận kết bạn mở quyền nhắn tin cho cuộc trò chuyện đang chờ.
- Hủy kết bạn không xóa chat; cuộc chat đã được mở tiếp tục nếu người nhận cho phép người lạ, còn “Chỉ bạn bè” thì chuyển sang chỉ đọc cho đến khi kết bạn lại hoặc đổi cài đặt.
- Bản đầu chỉ gửi văn bản, có số tin chưa đọc và đánh dấu đã đọc; chưa có tệp, gọi thoại/video hoặc typing indicator.
- Tin nhắn dùng client message ID để chống gửi trùng khi reconnect; phân trang lịch sử và đồng bộ số chưa đọc từ server.
- Chặn ngăn gửi tin `DIRECT` từ cả hai phía, giữ lịch sử để báo cáo. Chat `BOOKING` của chuyến đang hoạt động giữ khả năng liên hệ phục vụ chuyến; khi booking kết thúc thì chỉ đọc nếu bị chặn. Cảnh báo rõ quy tắc này khi chặn.
- Chat không tạo/đổi/hủy booking; thao tác chuyến phải qua nút nghiệp vụ và API chính thức.
- Thông báo trong app cho kết bạn, tin nhắn chờ, đề nghị chuyến, được nhận/từ chối/hết hạn, hủy chuyến, tin nhắn và nhắc đánh giá.
- Lưu thông báo để đọc sau khi kết nối lại; Socket.IO không phải nguồn dữ liệu duy nhất.
- Chi tiết quy tắc đánh giá hai chiều tại mục 9.4.

### 9.2. Dữ liệu di chuyển

- Lịch thường tuần mặc định riêng tư; chỉ bản hiển thị rút gọn của lịch được chủ tài khoản chia sẻ mới hiện với bạn bè. Địa chỉ nhà và địa điểm yêu thích luôn riêng tư trong bản đầu.
- Bảng tin chỉ hiển thị khu vực hoặc địa điểm công cộng; tọa độ chính xác không có trong payload công khai.
- Khi gửi đề nghị, người đi nhờ đồng ý chia sẻ điểm đón/xuống cho đúng chủ xe để tính tuyến; không mở vị trí trực tiếp.
- Sau khi có booking, các bên được xem điểm gặp và vị trí liên quan trong thời gian chuyến.
- Vị trí trực tiếp của người đi nhờ chỉ hiện với chủ xe, không hiện với người đi nhờ khác.
- Kết thúc/hủy booking thu hồi quyền xem vị trí trực tiếp.
- Redis giữ vị trí mới nhất với TTL 120 giây; bản đầu không lưu lịch sử GPS liên tục.
- Chặn ngăn ghép mới và ẩn bài hai phía, nhưng không xóa chứng cứ hay thông tin cần thiết của booking hiện có.

### 9.3. Quản trị và an toàn

- Duyệt hồ sơ, phương tiện, thành viên cộng đồng; quản lý báo cáo bài, người dùng, chuyến và tin nhắn.
- Khóa tài khoản chặn các hoạt động mới; chuyến đang có người trên xe cần xử lý có kiểm soát, không biến mất khỏi giao diện.
- Ghi nhật ký thao tác nhạy cảm và truy cập hồ sơ xác minh.
- Không ghi OTP, token, giấy tờ, mã lên xe hoặc tọa độ chi tiết vào log.
- Không quảng bá bản thử là có giám sát khẩn cấp hoặc cứu hộ liên tục.

### 9.4. Đánh giá tài xế và khách qua lại

- Sau mỗi booking `COMPLETED`, khách đánh giá tài xế và tài xế đánh giá đúng khách của booking đó; không cần là bạn bè. Không tự đánh giá, không đánh giá khách khác cùng xe.
- Mỗi chiều có một đánh giá, khóa duy nhất `(bookingId, reviewerId)`; điểm nguyên 1–5 sao, nhận xét tùy chọn tối đa 1.000 ký tự.
- Gợi ý nội dung: tài xế được đánh giá về đúng giờ, giao tiếp, cảm nhận an toàn; khách được đánh giá về đúng giờ, giao tiếp, tôn trọng thỏa thuận. Bản đầu chỉ tính một điểm tổng mỗi đánh giá, chưa có điểm từng tiêu chí.
- Thời hạn gửi là 7 ngày từ lúc booking hoàn thành. Đánh giá đã gửi không sửa ở bản đầu; giao diện xác nhận trước khi gửi.
- Chỉ công bố khi cả hai đã gửi hoặc hết hạn 7 ngày; trước đó mỗi người chỉ thấy đánh giá mình viết. API và thông báo không tiết lộ nội dung/điểm của phía kia khi còn ẩn.
- Profile tách điểm trung bình và số đánh giá **Tài xế** / **Khách đi nhờ** theo vai trò của người được đánh giá tại thời điểm booking. Một user dùng hai vai trò không bị trộn điểm.
- Chỉ đánh giá đã công bố và chưa bị ẩn do vi phạm mới vào điểm trung bình; chưa có đánh giá thì hiện nhãn riêng. Không công khai ngày giờ, tuyến hoặc điểm đón chính xác cùng đánh giá.
- Chuyến hủy, vắng mặt và kết thúc sớm dùng báo cáo, không tạo đánh giá sao trong bản đầu. Tranh chấp xác nhận tiền không khóa quyền đánh giá chuyến đã hoàn thành.
- Có báo cáo đánh giá; admin được ẩn/khôi phục với lý do và audit, không sửa sao thay người dùng. Hủy kết bạn/chặn không xóa đánh giá hợp lệ và không ngăn quyền gửi đánh giá cho booking đủ điều kiện; tài khoản bị khóa gửi qua quy trình hỗ trợ.

## 10. Giao diện và điều hướng

Điều hướng mobile web gồm **Bảng tin – Tìm chuyến – Đăng bài – Chuyến của tôi – Tài khoản**. Header có lối vào **Tin nhắn** và thông báo với badge chưa đọc; Tài khoản chứa lịch và bạn bè. Trang đầu có nhu cầu cá nhân sắp tới và lịch bạn bè đã chia sẻ.

| Nhóm        | Màn hình                                                               |
| ----------- | ---------------------------------------------------------------------- |
| Onboarding  | Giới thiệu, OTP, hồ sơ, xác minh thử nghiệm                            |
| Bảng tin    | Bốn tab gồm Bạn bè, bộ lọc, thẻ bài, chi tiết, lưu bài                 |
| Đăng bài    | Chọn cần chở/có xe, nhập tay hoặc lấy từ lịch, xem trước               |
| Lịch        | Lịch tuần, ngoại lệ, nhu cầu sắp tới, quyền chia sẻ và lịch bạn bè     |
| Kết nối     | Tìm user, profile người khác, danh sách bạn bè, lời mời đến/đi         |
| Tin nhắn    | Hộp thư, tin nhắn chờ, chat trực tiếp, chat booking, chưa đọc          |
| Đánh giá    | Form sau chuyến, trạng thái chờ công bố, điểm và nhận xét theo vai trò |
| Tìm và ghép | Bản đồ/danh sách, báo giá, đề nghị đến/đi                              |
| Chủ xe      | Phương tiện, chuyến, người được nhận, bật sẵn sàng                     |
| Hành trình  | Điểm dừng, vị trí, mã lên xe, xuống xe, hoàn thành                     |
| Cá nhân     | Bài của tôi, lịch sử chuyến, đánh giá, cộng đồng, quyền riêng tư       |
| Quản trị    | Hồ sơ, cộng đồng, báo cáo, cấu hình chi phí, audit                     |

Mỗi màn hình phải có trạng thái tải, trống, lỗi, mất kết nối và thử lại. Danh sách luôn dùng được khi bản đồ chưa tải. Nút hành động không chỉ phân biệt bằng màu; form có nhãn, thông báo lỗi và hỗ trợ bàn phím.

## 11. Kiến trúc production mục tiêu

Dike dùng **modular monolith** trong một monorepo. Chưa tách microservice vì đội nhỏ, nghiệp vụ booking cần transaction chặt và production pilot chỉ phục vụ tối đa khoảng 500 người.

```text
Next.js Web — Vercel
        │
        ├── REST /api/v1
        └── Socket.IO
                │
        NestJS API — Render Web Service
                │
     ┌──────────┼──────────────┐
     │          │              │
MongoDB Atlas  Redis       Cloudflare R2
     │       Render KV       public/private
     │          │
     └── NestJS Worker — Render Background Worker
                │
        Goong / OTP / eKYC adapters

Giai đoạn sau:
React Native Mobile ── dùng chung API và Socket.IO
```

### 11.1. Cấu trúc monorepo

```text
apps/
  web/                  Next.js App Router
  api/                  NestJS REST + Socket.IO
  worker/               BullMQ processors và scheduled jobs
  mobile/               React Native + Expo, tạo ở giai đoạn mobile

packages/
  api-client/           Client sinh từ OpenAPI
  contracts/            Enum, event và type dùng chung
  config/               TypeScript, ESLint, Prettier
  ui/                   Token và component web dùng chung

infra/
  docker/               Mongo replica set, Redis, MinIO local
  render.yaml
  scripts/

docs/
  architecture/
  api/
  operations/
```

- Dùng pnpm workspaces và khóa phiên bản bằng lockfile.
- Backend dùng NestJS + Mongoose; local/test chạy MongoDB replica set để kiểm thử transaction giống Atlas.
- Web dùng TanStack Query, React Hook Form, Zod, Tailwind và shadcn/ui; xây mới design token Urban Mint từ đặc tả giao diện trong tài liệu này.
- OpenAPI là hợp đồng API chính; sinh `packages/api-client` cho web và mobile.
- Redis/BullMQ quản lý job, rate limit, cache, presence và Socket.IO adapter.
- MongoDB là nguồn trạng thái chính; Redis và Socket.IO không phải nguồn dữ liệu cuối cùng.
- R2 có bucket public cho avatar và bucket private cho eKYC/phương tiện; file private chỉ đọc qua URL ký ngắn hạn.
- `local`, `test`, `staging` và `production` dùng database, bucket, OAuth client và secret riêng.

### 11.2. Module backend

```text
auth              users              files
verifications     vehicles           communities
friendships       blocks             schedules
travel-intents    routing            ride-posts
trips             proposals          bookings
availability      conversations      notifications
contributions     reviews            reports
admin             audit              outbox
```

Mỗi module có controller, DTO, application service, domain policy, repository và test riêng. `main.ts` chỉ bootstrap ứng dụng và đăng ký middleware/global concern; không chứa controller hoặc logic nghiệp vụ.

### 11.3. Dữ liệu cốt lõi

- Danh tính: `User`, `AuthIdentity`, `Session`, `PhoneVerification`, `Consent`, `PrivacySettings`.
- Xác minh: `VerificationCase`, `VerificationDocument`, `Vehicle`, `Community`, `Membership`.
- Xã hội: `Friendship`, `UserBlock`.
- Lịch: `ScheduleRule`, `ScheduleException`, `TravelIntent`.
- Bài/chuyến: `RidePost`, `SavedPost`, `Trip`, `TripStop`, `RouteSnapshot`.
- Ghép: `RideProposal`, `Booking`, `AvailabilitySession`.
- Giao tiếp: `Conversation`, `ConversationParticipant`, `MessageRequest`, `Message`, `Notification`.
- Tin cậy/vận hành: `ContributionQuote`, `PaymentAcknowledgement`, `Review`, `Report`, `AuditLog`, `OutboxEvent`.

GeoJSON `Point` và `LineString` dùng index `2dsphere`. Goong tính tuyến thực tế; MongoDB chỉ tìm tập ứng viên địa lý và lưu route snapshot.

Phân tách bắt buộc:

- `ScheduleRule` là lịch lặp; `TravelIntent` là nhu cầu cụ thể theo ngày/chiều.
- `RidePost` là bản công khai của nhu cầu; bài có xe tham chiếu `Trip`.
- `RideProposal` là đề nghị chưa giữ chỗ; `Booking` là thỏa thuận đã được chấp nhận.
- Mỗi nhu cầu chỉ có một bài mở và một booking còn hiệu lực.
- Friendship/direct conversation dùng cặp user chuẩn hóa để chống bản ghi trùng.
- Message dùng `clientMessageId` duy nhất theo conversation và người gửi.

### 11.4. State machine và transaction

- Verification: `NOT_SUBMITTED → PENDING → VERIFIED | REJECTED | EXPIRED`.
- Friendship: `PENDING → ACCEPTED | DECLINED | CANCELLED | REMOVED`.
- Post: `DRAFT → OPEN → MATCHED | CLOSED | EXPIRED | CANCELLED`.
- Trip: `DRAFT → OPEN → FULL → IN_PROGRESS → COMPLETED | CANCELLED`.
- Proposal: `PENDING → ACCEPTED | REJECTED | WITHDRAWN | EXPIRED`.
- Booking: `CONFIRMED → DRIVER_ARRIVED → BOARDED → IN_PROGRESS → COMPLETED`, hoặc `CANCELLED | NO_SHOW | ENDED_EARLY`.

Nhận proposal phải chạy trong MongoDB transaction:

1. Kiểm tra proposal còn hiệu lực.
2. Kiểm tra quyền, xác minh, lịch và số chỗ.
3. Giảm chỗ bằng conditional update.
4. Tạo booking và snapshot điều kiện đã đồng ý.
5. Cập nhật proposal, post và trip liên quan.
6. Ghi `OutboxEvent` trong cùng transaction.

### 11.5. API và realtime

Tất cả API production nằm dưới `/api/v1` và trả lỗi chuẩn:

```json
{
  "error": {
    "code": "NO_SEATS",
    "message": "Chuyến đi đã hết chỗ",
    "requestId": "..."
  }
}
```

Các nhóm endpoint:

- `/auth/google`, `/auth/callback`, `/auth/session`, `/auth/logout`, `/auth/phone`, `/auth/otp`.
- `/me`, `/users`, `/files`, `/verifications`, `/vehicles`.
- `/communities`, `/memberships`, `/friendships`, `/blocks`.
- `/schedules`, `/schedule-exceptions`, `/travel-intents`.
- `/routing/places`, `/routing/quote`, `/ride-posts`, `/saved-posts`.
- `/trips`, `/ride-proposals`, `/bookings`, `/availability`.
- `/conversations`, `/message-requests`, `/notifications`.
- `/contribution-quotes`, `/payment-acknowledgements`.
- `/reviews`, `/reports`, `/admin`.

Danh sách dùng cursor pagination. Các lệnh tạo bài, gửi/nhận proposal, hoàn thành chuyến và gửi tin nhắn hỗ trợ idempotency key.

Sự kiện Socket.IO:

```text
friendship.updated
schedule.sharing.updated
post.updated
proposal.created / proposal.updated
booking.updated
trip.updated
message.created
message_request.updated
conversation.read
notification.created
location.updated
review.published
```

Sau reconnect, client luôn tải lại trạng thái qua REST. Socket room phải được authorize phía server; event thu hồi quyền chỉ mang ID và yêu cầu client tải lại/gỡ dữ liệu.

### 11.6. Bảo mật bắt buộc

- Web dùng cookie `HttpOnly`, `Secure`, `SameSite`; mutation kiểm tra CSRF/Origin.
- OAuth dùng Authorization Code + PKCE, state và nonce.
- Backend kiểm tra quyền, giá, trạng thái và số chỗ; không tin dữ liệu tính từ client.
- Rate limit login, OTP, tìm user, lời mời, proposal, chat, upload và location.
- Kiểm tra quyền trên mỗi lần đọc/ghi và khi join/reconnect Socket.IO room.
- Cache phân biệt người xem và được vô hiệu hóa khi đổi friendship, block hoặc privacy.
- Private file không có public URL; backend cấp signed URL ngắn hạn sau khi kiểm tra quyền.
- Log không chứa token, OTP, giấy tờ, số điện thoại đầy đủ hoặc tọa độ nhạy cảm.
- Secret không nằm trong source; mỗi môi trường dùng secret riêng và có quy trình rotation.
- Production từ chối khởi động nếu fake OTP/eKYC hoặc demo auth còn bật.
- Dependency scan, secret scan, CodeQL, test quyền, IDOR và OWASP API Top 10 là CI/security gate.

## 12. Lộ trình triển khai production

Mỗi giai đoạn chỉ bắt đầu khi tiêu chí hoàn thành của giai đoạn trước đã đạt. Không dùng phần trăm giao diện để thay cho điều kiện nghiệm thu về transaction, quyền và bảo mật.

### Giai đoạn 0 — Chuẩn hóa repository và phạm vi

- Khởi tạo Git/GitHub greenfield từ hai tài liệu trong `plan/`; không tạo tag prototype vì source cũ không còn.
- Ghi quyết định xóa source cũ và nguyên tắc không khôi phục/migrate dữ liệu demo vào baseline/ADR.
- Khởi tạo pnpm workspace, cấu trúc thư mục rỗng có chủ đích và tooling dùng chung; thêm lint, format, typecheck, commit hooks và CI.
- Dùng flow nhẹ cho nhóm tin cậy: thành viên có quyền `Write` được tự merge hoặc push thay đổi rủi ro thấp vào `main`; PR/review/CI được khuyến nghị nhưng không ép bằng ruleset. Vẫn bật secret/dependency scanning và giữ quyền `Admin` ở mức tối thiểu.
- Viết ADR cho MongoDB, modular monolith, auth, R2 và deployment.
- Tạo backlog từ tài liệu này và ghi rõ phần ngoài phạm vi.

**Hoàn thành khi:** fresh clone có thể cài dependency và chạy toàn bộ quality/security checks của repository; CI xanh với workspace greenfield; repo không chứa secret/PII hoặc artefact từ source cũ.

### Giai đoạn 1 — Nền tảng backend và local infrastructure

Chi tiết task, ownership và nghiệm thu: [STAGE_1.md](STAGE_1.md).

- Scaffold từ đầu `apps/web`, `apps/api`, `apps/worker` và các package `api-client`, `contracts`, `config`, `ui` theo kiến trúc mục tiêu.
- Bootstrap NestJS theo module, config và global exception filter; không tạo controller/service nguyên khối.
- Bootstrap Next.js App Router với app shell tối thiểu và design token Urban Mint mới; chưa triển khai màn hình nghiệp vụ.
- Thêm validation DTO, OpenAPI, request ID, structured logging và health checks.
- Dựng MongoDB replica set, Redis và MinIO bằng Docker Compose cho local.
- Cấu hình Mongoose transaction, index runner và seed riêng cho test/dev.
- Tạo worker BullMQ, outbox processor và job mẫu có retry/idempotency.
- Sinh TypeScript API client từ OpenAPI.

**Hoàn thành khi:** API, worker và web greenfield chạy bằng một lệnh; health check và app shell hoạt động; test chứng minh transaction rollback và job retry không gây tác dụng lặp.

### Giai đoạn 2 — Google authentication và session

- Web đăng nhập Google bằng Authorization Code + PKCE, kiểm tra state và nonce.
- Backend quản lý `AuthIdentity`, `User` và opaque session.
- Web dùng secure cookie; thiết lập refresh, logout từng thiết bị, logout toàn bộ và revoke.
- Sau Google login, người dùng nhập số điện thoại ở trạng thái `UNVERIFIED`.
- Development dùng `REQUIRE_PHONE_OTP=false`; không tự merge tài khoản từ email/số chưa xác minh.

**Hoàn thành khi:** login, onboarding, refresh, revoke và logout chạy E2E; không tồn tại cơ chế demo header hoặc đường tắt giả mạo danh tính.

### Giai đoạn 3 — OTP và phân quyền tài khoản

Trạng thái: đã bổ sung implementation OTP local/test và role; chưa nghiệm thu integration/E2E trên môi trường hiện tại. Cổng production `S3-PILOT-01` vẫn mở, chưa có provider thật. Xem [runbook](../docs/operations/phone-verification.md).

- Tạo `OtpProvider` cho fake local/test và provider production.
- Rate limit theo IP, user, số điện thoại và thiết bị; OTP có hạn dùng, số lần thử và cooldown.
- Không lưu OTP dạng rõ; số Việt Nam chuẩn hóa E.164 và chỉ unique sau khi xác minh.
- Quyền gồm `MEMBER`, `VERIFIED_MEMBER`, `APPROVED_DRIVER`, `MODERATOR`, `ADMIN`.
- Trước pilot bật `REQUIRE_PHONE_OTP=true`.

**Hoàn thành khi:** brute-force/rate-limit test đạt; một số đã xác minh không thể thuộc hai tài khoản.

### Giai đoạn 4 — Hồ sơ, quyền riêng tư và R2

- Xây hồ sơ, avatar, privacy settings, consent và yêu cầu xóa tài khoản.
- Upload bằng presigned URL; backend kiểm tra MIME, kích thước và ownership.
- Avatar ở public bucket; hồ sơ xác minh ở private bucket.
- Cleanup upload dở và xóa file theo retention policy.

**Hoàn thành khi:** người ngoài không đọc được private file dù biết object key; upload sai loại/quá dung lượng bị chặn.

### Giai đoạn 5 — eKYC sandbox, phương tiện và cộng đồng

- Tạo adapter eKYC, xác thực webhook signature và xử lý callback idempotent.
- Chỉ dùng dữ liệu tổng hợp trong sandbox.
- Admin duyệt/từ chối hồ sơ, phương tiện và membership với lý do/audit log.
- Chỉ `VERIFIED_MEMBER` được đăng nhu cầu; chỉ `APPROVED_DRIVER` được tạo chuyến.

**Hoàn thành khi:** toàn bộ luồng chạy qua UI admin, không sửa database thủ công.

### Giai đoạn 6 — Bạn bè, chặn và quyền truy cập

- Hoàn thiện gửi, nhận, rút, từ chối, hủy kết bạn và thời gian chờ gửi lại.
- Chuẩn hóa cặp user; hai lời mời ngược chiều không tự chấp nhận.
- Block hủy quan hệ/lời mời và ngăn tương tác mới.
- Dùng policy service chung cho profile, lịch, bài, chat và Socket.IO.

**Hoàn thành khi:** integration test chứng minh không thể vượt quyền bằng URL, API, cache hoặc socket room.

### Giai đoạn 7 — Lịch và nhu cầu di chuyển

- CRUD `ScheduleRule`, khoảng áp dụng, chiều đi/về, buffer và timezone.
- Hỗ trợ ngoại lệ theo ngày, tạm dừng, kết thúc và xung đột.
- Worker sinh `TravelIntent` trước 14 ngày với unique key chống trùng.
- Chia sẻ `PRIVATE/FRIENDS`; projection bạn bè loại bỏ địa chỉ/tọa độ riêng tư.

**Hoàn thành khi:** test timezone, job lặp, ngoại lệ, lịch chồng và thu hồi quyền đều đạt.

### Giai đoạn 8 — Goong, địa điểm, tuyến và báo giá

- Tạo `RoutingProvider`; production dùng Goong, test dùng deterministic fake.
- Backend tính tuyến, khoảng cách, ETA, chiều tuyến và detour; lưu route snapshot.
- Cache kết quả ngắn hạn; tính đóng góp gợi ý bằng cấu hình server và lưu VND dạng số nguyên.
- Không dùng khoảng cách đường thẳng thay cho đường bộ khi provider lỗi.

**Hoàn thành khi:** test cùng/ngược hướng, detour, ETA, timeout, quota và quote hết hạn đạt.

### Giai đoạn 9 — Bài đăng và bảng tin

- Tạo `NEED_RIDE` từ intent và `OFFER_RIDE` từ trip.
- Hỗ trợ draft, publish, edit, close, expire, save và report.
- Phạm vi `PUBLIC`, `COMMUNITY`, `FRIENDS`; tìm kiếm theo thời gian, xe, community và tuyến.
- Bạn bè chỉ được ưu tiên trong tập ứng viên hợp lệ; dùng cursor pagination và index phù hợp.

**Hoàn thành khi:** feed không rò dữ liệu và p95 dưới 2 giây trên 1.000 chuyến mẫu.

### Giai đoạn 10 — Trip và quản lý chỗ

- Chủ xe tạo trip, route, phương tiện, chỗ, detour và contribution policy.
- Xe máy tối đa một khách; ô tô theo số chỗ đã duyệt.
- Quản lý `TripStop`; chưa tái sử dụng chỗ theo đoạn.
- Chỗ được cập nhật bằng conditional write; ngăn chuyến trùng giờ.

**Hoàn thành khi:** hai request đồng thời tranh chỗ cuối chỉ một request thành công.

### Giai đoạn 11 — Proposal và booking

- Hỗ trợ khách xin đi và chủ xe đề nghị chở.
- Proposal lưu snapshot điểm, giờ, giá, hạn và phiên bản bài/trip.
- Accept kiểm tra lại điều kiện, tạo booking nguyên tử và vô hiệu proposal xung đột.
- Thêm mã lên xe, hủy, no-show, kết thúc sớm và quy tắc hoàn chỗ.

**Hoàn thành khi:** test concurrency, idempotency, quote thay đổi, hết hạn và lịch xung đột đạt.

### Giai đoạn 12 — Chat, thông báo và realtime

- Chat trực tiếp có message request; chat booking được tạo tự động.
- Message có `clientMessageId`, cursor pagination và read marker.
- Socket room được authorize mỗi lần join/reconnect.
- Notification in-app; email/push qua adapter, lỗi gửi không rollback nghiệp vụ.

**Hoàn thành khi:** reconnect không lặp tin, unread đúng, block ngăn chat và người ngoài không join room.

### Giai đoạn 13 — Đi ngay, presence và hành trình trực tiếp

- Availability session có heartbeat và TTL.
- Chỉ thu/chia sẻ vị trí khi người dùng chủ động bật và booking cho phép.
- Ghép tức thì vẫn đi qua proposal/booking và bước đồng ý.
- Server kiểm tra transition arrived, boarded, start và complete.

**Hoàn thành khi:** mô phỏng chuyến tức thì trên hai client; reconnect/mất heartbeat đúng quy tắc.

### Giai đoạn 14 — Chi phí, đánh giá và kiểm duyệt

- Chỉ gợi ý đóng góp và xác nhận thanh toán ngoài nền tảng.
- Đánh giá hai chiều; công bố khi cả hai gửi hoặc hết 7 ngày.
- Worker công bố review idempotent; tính điểm từ review đã công bố.
- Report user/post/message/trip; admin xử lý, khóa user và ghi audit.

**Hoàn thành khi:** không thể tự đánh giá, gửi trùng, đánh giá sai booking hoặc đọc review chưa công bố.

### Giai đoạn 15 — Hoàn thiện web

- Xây các màn hình production theo route, feature module, component và query hook trên app shell đã tạo ở Giai đoạn 1.
- Hoàn thiện onboarding, feed, lịch, chuyến, inbox, profile, verification và admin.
- Mỗi màn hình có loading, empty, error, offline và retry.
- Responsive, keyboard/focus/screen reader; optimistic update có rollback.
- PWA chỉ cung cấp install/offline shell, không tuyên bố GPS nền.

**Hoàn thành khi:** Playwright chạy luồng chính trên desktop/mobile viewport và không có lỗi accessibility nghiêm trọng.

### Giai đoạn 16 — Mobile React Native

- Tạo Expo development build và dùng chung API client, enum, design token.
- Google native login đổi token với backend; session nằm trong secure storage.
- Push qua FCM/APNs; hỗ trợ deep link, reconnect, offline queue idempotent.
- Background location chỉ bật trong booking active và được kiểm thử trên thiết bị thật.

**Hoàn thành khi:** luồng tìm chuyến → booking → hành trình → đánh giá chạy trên Android và iOS.

### Giai đoạn 17 — Production hardening và pilot

- Deploy web lên Vercel; API/worker/cron/Redis-compatible store lên Render; MongoDB Atlas và R2 tách môi trường.
- Custom domain, CORS allowlist, HTTPS/WSS, OTP bắt buộc và production guard chống fake provider.
- CI/CD có staging, production approval, smoke test và rollback.
- Sentry, structured log, alert cho error rate, latency, queue và provider/database failure.
- Backup/PITR và restore drill; load test 100 WebSocket và 20 lượt nhận chỗ đồng thời.
- Security review OAuth, session, upload, IDOR, rate limit, socket và secret rotation.
- Hoàn thiện privacy, consent, retention, incident response và support trước dữ liệu thật.
- Pilot theo đợt: nội bộ → 20 → 50–100 → tối đa 500 người.

**Hoàn thành khi:** có runbook, báo cáo restore/load/security, dashboard giám sát và rollback procedure.

## 13. Chiến lược kiểm thử và bàn giao

### 13.1. Các tầng test

- Unit: state machine, quyền, giá, matching và validation.
- Integration: MongoDB replica set, transaction, index, Redis/BullMQ và outbox.
- Contract: OpenAPI và generated client không lệch nhau.
- API: Supertest cho auth, authorization, idempotency và error code.
- Web E2E: Playwright với nhiều tài khoản/trình duyệt.
- Mobile E2E: Maestro hoặc Detox cho luồng quan trọng.
- Load: k6 cho feed, booking concurrency, Socket.IO và chat.
- Security: dependency/secret scan và kiểm thử OWASP API Top 10.

### 13.2. Luồng E2E bắt buộc

1. Google login → số điện thoại → OTP → hồ sơ.
2. eKYC → duyệt phương tiện/community.
3. Lịch → intent → bài đăng.
4. Trip → khách gửi proposal → chủ xe nhận → booking.
5. Chủ xe đề nghị từ bài cần xe → khách nhận → booking.
6. Tranh chỗ cuối đồng thời.
7. Chat → arrived → boarded → complete → chi phí → review hai chiều.
8. Hủy, no-show, hết hạn, provider lỗi và mất mạng.
9. Kết bạn → chia sẻ lịch → hủy bạn/block → thu hồi quyền.
10. Admin xử lý report, khóa tài khoản và truy vết audit.

Không bàn giao nếu còn lỗi nghiêm trọng về quyền truy cập, vượt chỗ, trạng thái booking, lộ vị trí hoặc giả mạo danh tính.

## 14. Giả định và giới hạn đã chốt

- Mục tiêu là production pilot tối đa khoảng 500 người, chưa dùng microservice/Kubernetes.
- Hoàn thiện web trước, React Native sau khi API và nghiệp vụ ổn định.
- Database là MongoDB Atlas; PostgreSQL/PostGIS và Prisma không còn là lựa chọn hiện hành.
- Web ở Vercel; API, worker, cron và Redis-compatible store ở Render.
- Routing dùng Goong qua adapter; file dùng Cloudflare R2.
- Auth bắt đầu bằng Google; development có thể chưa bắt OTP nhưng production pilot bắt buộc OTP.
- eKYC dùng sandbox khi phát triển và chỉ dùng dữ liệu tổng hợp.
- Thanh toán diễn ra ngoài nền tảng; không làm ví, thu hộ, hoàn tiền hoặc đối soát.
- Không có source hoặc dữ liệu legacy để migrate; database bắt đầu rỗng và seed local/test phải là dữ liệu tổng hợp mới, có thể tái tạo.
- Chưa thu giấy tờ thật hoặc mở pilot trước khi hoàn tất rà soát pháp lý, retention và bảo vệ dữ liệu.
- Ngoài phạm vi pilot đầu: group chat, gọi điện, bình luận công khai, OCR lịch, tự điều phối, đặt hộ, trẻ em đi một mình và tối ưu quy mô lớn.

---

## Phụ lục A — Đề xuất thiết kế lịch sử, không còn hiệu lực

Phụ lục A–F bên dưới chỉ được giữ để truy vết quá trình ra quyết định sản phẩm. Source tương ứng không còn tồn tại và không được giả định là nền tảng để refactor, migrate hoặc khôi phục. Khi có khác biệt, phần 11–14 ở trên là nguồn quyết định hiện hành.

### A.1. Kiến trúc kỹ thuật cũ

#### A.1.1. Cấu trúc cũ

Dùng modular monolith: một backend chia module nghiệp vụ, một worker từ cùng codebase; chưa dùng microservices.

```text
Next.js Web                         React Native Mobile (sau)
     └──────────── REST /api/v1 + Socket.IO ────────────┘
                              |
                          NestJS API
                              |
             PostgreSQL/PostGIS + Redis + Object storage
                              |
                      Background worker
                              |
                 Routing / OTP / Identity adapters
```

| Thành phần      | Lựa chọn                                         |
| --------------- | ------------------------------------------------ |
| Monorepo        | pnpm workspaces                                  |
| Web             | Next.js App Router, Tailwind CSS, shadcn/ui      |
| Server state    | TanStack Query                                   |
| Backend         | NestJS, REST, OpenAPI                            |
| Database        | PostgreSQL + PostGIS                             |
| ORM             | Prisma; SQL có tham số cho truy vấn PostGIS      |
| Realtime        | Socket.IO                                        |
| Job và presence | BullMQ + Redis                                   |
| File local      | MinIO, tương thích S3                            |
| Test            | Jest, Supertest, Playwright                      |
| Local và CI     | Docker Compose, GitHub Actions khi có repository |

Các thư mục chính: `apps/web`, `apps/api`, `packages/contracts`. Chốt phiên bản ổn định tương thích tại tuần 1 và khóa trong lockfile; không dùng phụ thuộc trôi nổi.

#### A.1.2. Dữ liệu cốt lõi cũ

| Nhóm                  | Thực thể                                                                     |
| --------------------- | ---------------------------------------------------------------------------- |
| Danh tính             | User, Session, Verification, Consent, UserPrivacySettings                    |
| Bạn bè                | Friendship (cặp user chuẩn hóa, người gửi, trạng thái, mốc gửi lại)          |
| Phương tiện/cộng đồng | Vehicle, VehicleReview, Community, Membership                                |
| Lịch                  | ScheduleRule, ScheduleException                                              |
| Nhu cầu và xã hội     | TravelIntent, RidePost, SavedPost                                            |
| Ghép                  | RideProposal, Booking                                                        |
| Di chuyển             | Trip, TripStop, RouteSnapshot, AvailabilitySession                           |
| Chi phí               | ContributionQuote, PaymentAcknowledgement                                    |
| Giao tiếp             | Conversation, ConversationParticipant, MessageRequest, Message, Notification |
| Tin cậy/vận hành      | Review, Report, UserBlock, AuditLog, OutboxEvent                             |

Phân tách bắt buộc:

- **ScheduleRule:** lịch lặp, quyền `PRIVATE/FRIENDS`; bản chiếu rút gọn dành cho bạn bè được tạo lúc đọc.
- **TravelIntent:** một nhu cầu vào ngày/chiều cụ thể, từ lịch hoặc nhập tay.
- **RidePost:** bản công khai của nhu cầu; bài có xe tham chiếu Trip.
- **RideProposal:** lời đề nghị với điều kiện đã chốt, chưa giữ chỗ.
- **Booking:** thỏa thuận được hai bên nhận, gắn chuyến thật của chủ xe.

Mỗi nhu cầu chỉ có một bài đang mở và một booking còn hiệu lực. Bài có xe có thể có nhiều booking trong giới hạn chỗ. Ràng buộc phải được bảo vệ ở database/transaction, không chỉ trên giao diện.

Ràng buộc xã hội: `Friendship` và cuộc chat `DIRECT` duy nhất theo cặp user chuẩn hóa; `BOOKING` duy nhất theo booking. `ConversationParticipant` lưu mốc đã đọc. `Message` có client ID duy nhất theo cuộc chat/người gửi. `Review` lưu người viết, người nhận, vai trò người nhận tại thời điểm chuyến, sao, nhận xét, hạn công bố và trạng thái kiểm duyệt. Điểm profile tính từ đánh giá đã công bố; job hết hạn phải chạy lại an toàn, không cộng điểm hai lần.

#### A.1.3. API và sự kiện cũ

| API dưới `/api/v1`                                      | Chức năng                                                                          |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `/auth`, `/me`                                          | OTP, phiên, hồ sơ, xác minh, quyền riêng tư                                        |
| `/users`                                                | Tìm theo tên, profile và đánh giá được phép xem                                    |
| `/friendships`                                          | Danh sách, lời mời, chấp nhận, từ chối, rút, hủy kết bạn                           |
| `/vehicles`, `/communities`                             | Xe, hồ sơ, cộng đồng và thành viên                                                 |
| `/schedules`                                            | Lịch lặp, ngoại lệ, tạm dừng, quyền chia sẻ; endpoint đọc lịch bạn bè có lọc quyền |
| `/travel-intents`                                       | Nhu cầu theo ngày và tìm phù hợp                                                   |
| `/ride-posts`                                           | Bảng tin, chi tiết, đăng, đóng, lưu                                                |
| `/ride-proposals`                                       | Gửi, rút, chấp nhận, từ chối                                                       |
| `/trips`, `/bookings`                                   | Tuyến, chỗ, lên/xuống xe, hoàn thành, hủy                                          |
| `/availability`                                         | Sẵn sàng, heartbeat và vị trí                                                      |
| `/conversations`, `/message-requests`, `/notifications` | Chat trực tiếp/booking, tin nhắn chờ, đã đọc, thông báo                            |
| `/reviews`                                              | Gửi đánh giá theo booking, đọc đánh giá đã công bố, báo cáo                        |
| `/reports`, `/admin`                                    | Báo cáo và vận hành                                                                |

Sự kiện: `proposal.created`, `proposal.updated`, `booking.updated`, `trip.updated`, `post.updated`, `message.created`, `notification.created`, `location.updated`.

Sự kiện bổ sung: `friendship.updated`, `schedule.sharing.updated`, `message_request.updated`, `conversation.read`, `review.published`. Sự kiện đổi quyền chỉ gửi ID và yêu cầu tải lại/gỡ nội dung, không đính kèm lịch đã bị thu hồi. Không phát điểm đánh giá chưa công bố cho người được đánh giá.

- REST/database là nguồn trạng thái chính; reconnect phải đồng bộ lại.
- Payload sự kiện chỉ có dữ liệu được phép; xác thực quyền room ở server.
- Phân trang bằng cursor cho bảng tin và chat.
- API có lỗi nghiệp vụ rõ như `NO_SEATS`, `PROPOSAL_EXPIRED`, `SCHEDULE_CONFLICT`, `QUOTE_CHANGED`.
- Idempotency cho đăng bài từ nhu cầu, gửi/nhận đề nghị và hoàn thành.
- Chấp nhận khóa các bản ghi liên quan theo thứ tự nhất quán, kiểm tra lại số chỗ và xung đột lịch rồi tạo booking nguyên tử.
- Ghi outbox cùng transaction; worker phát thông báo và xử lý lại an toàn khi trùng sự kiện.
- Lưu timestamp UTC; lịch lặp lưu ngày/giờ địa phương với múi giờ `Asia/Ho_Chi_Minh`. Tiền là số nguyên VND.

#### A.1.4. Bảo mật triển khai cũ

- Web dùng cookie HttpOnly/Secure và kiểm tra CSRF/Origin cho lệnh thay đổi dữ liệu.
- Backend là nơi kiểm tra quyền, giá, trạng thái và số chỗ; không tin giá trị tính từ client.
- Rate limit OTP, login, tìm user, kết bạn, tin nhắn chờ, đề nghị, chat và vị trí.
- Kiểm tra quyền xã hội trên mỗi lần đọc/ghi; cache profile/bảng tin/lịch phải phân biệt người xem và được vô hiệu hóa khi kết bạn, chặn hoặc thay đổi quyền. Không dùng cache công khai cho lịch bạn bè.
- File riêng tư không được phát bằng URL công khai; URL ký có hạn dùng cho tài nguyên được phép.
- Tách development/test/production và bí mật môi trường.
- Production từ chối khởi động nếu bật OTP hoặc xác minh giả lập.
- Mobile sau này dùng cơ chế token phù hợp trên cùng dịch vụ xác thực, không phụ thuộc cookie trình duyệt.

### A.2. Tích hợp và dữ liệu thử của prototype

Định nghĩa `RoutingProvider`, `OtpProvider`, `IdentityProvider`; logic nghiệp vụ không phụ thuộc SDK cụ thể.

#### A.2.1. Bản thử không ngân sách

- Bộ địa điểm và tuyến GeoJSON cố định cho một khu vực mẫu.
- MapLibre hiển thị tuyến/điểm; nếu không có nguồn bản đồ nền phù hợp, dùng sơ đồ nền đơn sắc có nhãn dữ liệu thử.
- Tọa độ/định tuyến ngoài bộ dữ liệu trả về “Chưa hỗ trợ trong bản thử”; không dùng khoảng cách đường thẳng để giả làm quãng đường đường bộ.
- Công cụ mô phỏng vị trí, heartbeat và nhiều người dùng, có nhãn rõ.
- OTP test chỉ ở môi trường thử; kết quả eKYC giả lập đủ thành công, thất bại, chờ và hết hạn.
- Hồ sơ và giấy tờ mẫu là dữ liệu tổng hợp, không dùng giấy tờ người thật.
- Các thời gian/chi phí tuyến mẫu là dữ liệu kiểm thử, không phải báo giá hoặc ETA vận hành.

#### A.2.2. Định hướng tích hợp lịch sử

- Goong là hướng tích hợp định tuyến Việt Nam; tài liệu có chế độ `bike` và `car`.
- FPT.AI eKYC là ứng viên xác minh; phải kiểm tra hợp đồng, quyền SDK, webhook và chính sách dữ liệu trước khi tích hợp thật.
- Nhà cung cấp SMS chỉ chốt khi có báo giá và ngân sách; interface đã tách để không chặn bản thử.
- Không giả định dịch vụ miễn phí đủ cho vận hành. Hạn mức bản đồ, SMS, eKYC, máy chủ và lưu trữ phải được theo dõi riêng.

### A.3. Lộ trình prototype 8 tuần

#### A.3.1. Phân công cũ

| Thành viên             | Trách nhiệm chính                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------- |
| A — Web                | Design system, bảng tin, lịch, profile/bạn bè, hộp thư, đánh giá, hành trình, quản trị |
| B — Backend            | Auth, lịch, quan hệ bạn bè/quyền, bài, đề nghị, booking, giá, đánh giá                 |
| C — Ghép và chất lượng | Định tuyến, realtime/chat, vị trí, adapter, worker, CI, test tích hợp                  |

Mỗi người viết kiểm thử cho nghiệp vụ mình làm; C không phải người duy nhất kiểm thử. Thay đổi quan trọng có người khác review. Dùng hợp đồng API và dữ liệu mẫu ngay tuần 1 để web/backend phát triển đồng thời.

#### A.3.2. Mốc thực hiện cũ

| Tuần | Công việc chính                                                                                                    | Nghiệm thu                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| 1    | Chốt wireframe, state machine, schema, API; monorepo, Docker, CI, tuyến mẫu                                        | Chạy cả hệ thống local, đăng nhập thử, xem thẻ bài và tuyến mẫu               |
| 2    | Hồ sơ, xem profile, kết bạn, xác minh giả lập, xe, cộng đồng; lịch và ngoại lệ                                     | Kết bạn đúng trạng thái; sinh nhu cầu đúng và phân quyền hồ sơ                |
| 3    | Hai loại bài, ưu tiên bạn bè, chia sẻ lịch, tìm tuyến, giá, bản nháp                                               | Bạn bè được ưu tiên trong tập hợp lệ; lịch riêng không lộ, thu hồi quyền đúng |
| 4    | Đề nghị hai chiều, transaction, booking, mã lên xe, hủy/hoàn thành                                                 | Hẹn trước xuyên suốt bằng hai tài khoản; tranh chấp chỗ xử lý đúng            |
| 5    | Sẵn sàng tức thì, heartbeat, hết hạn 60 giây, vị trí, reconnect                                                    | Ghép tức thì trên hai trình duyệt, ẩn người mất kết nối                       |
| 6    | Ô tô nhiều điểm dừng, chat trực tiếp/booking và tin nhắn chờ, thông báo, tiền trực tiếp, đánh giá hai chiều, admin | Nhắn tin không cần booking; công bố đánh giá và tách điểm đúng vai trò        |
| 7    | Test đồng thời, lịch xung đột, bảo mật, lỗi mạng, UI responsive, phục hồi                                          | Hết lỗi nghiêm trọng về quyền, chỗ và trạng thái                              |
| 8    | UAT, sửa lỗi, tài liệu, demo và đóng gói                                                                           | Có bản thử ổn định, báo cáo test và danh sách điều kiện chạy thật             |

#### A.3.3. Kiểm soát phạm vi cũ

- Không thêm tính năng sau tuần 4 nếu chưa đổi tiến độ rõ ràng.
- Nếu chậm, giảm hiệu ứng và dashboard thống kê trước; không bỏ chống trùng chỗ, phân quyền hoặc đánh dấu dữ liệu giả lập.
- Đánh giá tiến độ cuối mỗi tuần; không đổi nhãn một phần giả lập thành “đã tích hợp” để đạt mốc.
- 8 tuần là ước lượng cho đội đã có nền tảng React/TypeScript; cần điều chỉnh nếu thời gian thực tế mỗi người thấp hơn giả định.
- Kết bạn, chia sẻ lịch, nhắn tin trực tiếp và đánh giá hai chiều làm phạm vi tăng. Vẫn đặt mục tiêu bản thử 8 tuần, nhưng đánh giá lại sức tải cuối tuần 2; nếu vượt năng lực thì điều chỉnh ngày bàn giao minh bạch, không âm thầm bỏ tính năng đã yêu cầu. Giữ chat văn bản, không thêm group chat, tệp hoặc gọi điện.

### A.4. Bộ tiêu chí nghiệm thu nghiệp vụ kế thừa

#### A.4.1. Lịch và bảng tin

- Lịch đúng thứ, ngày áp dụng, giờ đệm và từng chiều; job chạy lại không sinh trùng.
- Nghỉ một ngày không sinh nhu cầu mới; sửa lịch không sửa bài/booking đã cam kết.
- Hai lịch chồng giờ được cảnh báo; không tự chọn nhầm nhu cầu.
- Nhấn đăng nhiều lần chỉ có một bài cho cùng nhu cầu.
- Bài hết hạn/đủ người không còn CTA sai; saved post vẫn phản ánh trạng thái hiện tại.
- Người ngoài không đọc được lịch riêng và bài cộng đồng qua URL/API.
- Bài bạn bè hợp lệ đứng trước bài người lạ ở tab phù hợp; tình bạn không làm bài sai giờ/sai tuyến hoặc thiếu quyền cộng đồng lọt kết quả.
- Chia sẻ/hủy chia sẻ lịch chỉ ảnh hưởng bản chiếu cho bạn bè, không thay bài hoặc booking.

#### A.4.2. Ghép và đồng thời

- Gần nhau nhưng ngược hướng bị loại; điểm xuống trước điểm đón bị loại.
- Không nhận chuyến khiến người dùng trễ hạn cần đến.
- Thêm điểm ô tô giữ thứ tự cũ và không vượt tổng mức vòng thêm.
- Hai người nhận chỗ cuối đồng thời chỉ một thành công.
- Người đi nhờ đồng ý hai đề nghị đồng thời chỉ có một booking cho nhu cầu.
- Hai nhu cầu khác nhau nhưng trùng giờ cũng không được nhận đồng thời.
- Gửi lại cùng idempotency key không tạo thêm tác dụng.
- Nhận/hủy/hết hạn đồng thời cho kết quả nhất quán; không âm chỗ hoặc dư chỗ.

#### A.4.3. Realtime và quyền

- Mất heartbeat bị ẩn, vị trí cũ có nhãn, reconnect không lặp booking.
- Nhận sau hạn 60 giây bị từ chối theo giờ server.
- Người ngoài không join được room hoặc xem vị trí/chat.
- Chặn/khóa ngăn hoạt động mới nhưng không xóa thông tin hành trình đang diễn ra.
- Client không sửa được giá, số chỗ hoặc trạng thái xác minh.
- Production không chạy với provider danh tính/OTP giả lập.
- Lời mời kết bạn hai chiều đồng thời không tạo quan hệ trùng hoặc tự chấp nhận; người gửi không tự duyệt lời mời của mình.
- Hủy kết bạn/chặn thu hồi lịch và bài `FRIENDS` qua API, cache và realtime; địa chỉ nhà không xuất hiện trong payload bạn bè.
- Tin nhắn chờ chỉ có một lời mở đầu trước khi được nhận; không gửi vượt quyền, không lặp tin khi reconnect, số chưa đọc đúng trên nhiều phiên.
- Chat trực tiếp bị chặn không gửi tiếp được; chat booking đang hoạt động theo ngoại lệ được mô tả rõ, không mở quyền GPS ngoài booking.
- Đánh giá chỉ từ hai bên booking hoàn thành; chặn tự đánh giá, gửi trùng và đánh giá hành khách khác.
- Điểm/nhận xét phía kia không bị lộ trước khi cả hai gửi hoặc hết 7 ngày; job công bố chạy lặp không nhân đôi điểm.
- Profile tính riêng điểm tài xế và khách, loại đánh giá bị ẩn; chặn/hủy kết bạn không xóa đánh giá hợp lệ.

#### A.4.4. E2E và vận hành

- Từ lịch → nhu cầu → bài → đề nghị → booking → lên xe → hoàn thành → tiền → đánh giá.
- Cả chiều người đi nhờ xin và chiều chủ xe đề nghị.
- Xe máy một người và ô tô hai người với điểm đón/xuống khác nhau.
- Hủy, vắng mặt, kết thúc sớm, báo cáo, nhu cầu tìm lại.
- GPS bị từ chối, API định tuyến không hỗ trợ, mất mạng và tải lại trang.
- Cài mới theo README và khôi phục database từ backup thử.
- Tìm user → xem profile → kết bạn → chia sẻ lịch → thấy nội dung ưu tiên → chat → tạo booking → hai bên đánh giá → xem điểm theo vai trò.
- User chưa kết bạn gửi tin nhắn chờ, người nhận chấp nhận/từ chối; đổi cài đặt tin nhắn, hủy kết bạn và chặn cho kết quả đúng.

#### A.4.5. Điều kiện bàn giao

- Mọi luồng bắt buộc chạy qua UI, không cần sửa database thủ công.
- Không còn lỗi nghiêm trọng về truy cập dữ liệu, vượt chỗ, giá hoặc chuyển trạng thái.
- Test tự động bao phủ transaction, quyền truy cập, sinh/chia sẻ lịch, kết bạn, chat và công bố đánh giá; E2E bao phủ hai chiều đề nghị cùng luồng xã hội.
- Kiểm thử mục tiêu 100 kết nối realtime, 20 yêu cầu đặt đồng thời; công bố cấu hình máy và kết quả thực tế.
- Mục tiêu tìm kiếm p95 dưới 2 giây trên 1.000 chuyến mẫu, không tính dịch vụ ngoài; đây là tiêu chí thử, không phải SLA production.
- Có README, biến môi trường mẫu, seed, OpenAPI, sơ đồ dữ liệu, tài khoản demo, kịch bản demo, hướng dẫn admin và giới hạn đã biết.

### A.5. Ghi chú lịch sử về ra mắt và mobile

#### A.5.1. Điều kiện trước pilot

- Có ngân sách và quyền sử dụng bản đồ, SMS, eKYC; kiểm thử callback/retry và lỗi nhà cung cấp.
- Xác minh lại bằng quy trình thật; tuyệt đối không chuyển cờ xác minh thử thành thật.
- Tách dữ liệu demo khỏi môi trường vận hành, kiểm thử tuyến thực tế từng loại xe.
- Rà soát mô hình chia sẻ chi phí, trách nhiệm, bảo hiểm và nghĩa vụ pháp lý áp dụng; không kết luận chỉ từ tên gọi sản phẩm.
- Chốt chính sách đồng ý, lưu giữ/xóa dữ liệu và quyền truy cập giấy tờ trước khi thu dữ liệu thật.
- Có quy trình tiếp nhận phản ánh, duyệt chủ xe, khóa tài khoản và hỗ trợ sự cố; công bố rõ giờ hỗ trợ.
- HTTPS, backup tự động, thử restore, giám sát lỗi, cảnh báo chi phí và kế hoạch rollback migration.

Luật Bảo vệ dữ liệu cá nhân là một nguồn cần rà soát cùng các quy định áp dụng tại thời điểm triển khai; tài liệu này không thay thế đánh giá pháp lý cho mô hình thực tế.

#### A.5.2. Pilot theo đợt

Mặc định một khu vực, 1–2 cộng đồng tự nguyện, khoảng 50–100 người được mời. Chưa chốt địa danh vận hành vì cần cộng đồng tham gia và kiểm chứng cung/cầu.

Theo dõi:

- Tỷ lệ nhu cầu tìm được ứng viên, gửi đề nghị và được chấp nhận.
- Thời gian phản hồi; tỷ lệ hoàn thành, hủy và vắng mặt.
- Tỷ lệ người quay lại dùng lịch tuần và đăng nhu cầu lần tiếp theo.
- Lỗi API, độ trễ tìm kiếm, job tồn, Socket.IO mất kết nối.
- Số báo cáo, thời gian xử lý và chi phí dịch vụ trên một chuyến thành công.

Chỉ mở rộng sau khi xử lý lỗi nghiêm trọng và đội vận hành đáp ứng được lượng người dùng. Kế hoạch không ấn định ngày ra mắt thật trước khi các điều kiện trên được đáp ứng.

#### A.5.3. Mobile

Định hướng React Native + Expo development build, tiếp tục TypeScript và hợp đồng API đã có.

Ưu tiên push đề nghị, vị trí nền trong chuyến, dẫn đường tới điểm gặp, khôi phục sau mất mạng và tối ưu pin. Kiểm thử quyền vị trí/nền trên Android/iOS thật; không coi chuyển UI web là đã giải quyết GPS nền.

Chia sẻ API client, kiểu dữ liệu và quy tắc hiển thị; không cố dùng chung toàn bộ UI web/mobile. Thanh toán qua nền tảng và tự đăng từ lịch chỉ thiết kế tiếp sau khi pilot chứng minh nhu cầu.

### A.6. Tài liệu tham khảo và giả định lịch sử

#### A.6.1. Nguồn kỹ thuật

- [Next.js App Router](https://nextjs.org/docs/app/getting-started)
- [NestJS WebSocket gateways](https://docs.nestjs.com/websockets/gateways)
- [MDN Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API)
- [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/)
- [Goong Directions, chế độ xe máy và ô tô](https://document.goong.io/tutorial-Direction.html)
- [FPT.AI eKYC Web SDK](https://ekyc-sdk.fpt.ai/)
- [Luật Bảo vệ dữ liệu cá nhân — nguồn Chính phủ](https://vanban.chinhphu.vn/?docid=214590&pageid=27160)

#### A.6.2. Giả định và giới hạn cũ

- Tên dự án dùng theo thư mục hiện tại: Dike.
- Chưa có mã nguồn cần kế thừa tại thời điểm lập kế hoạch.
- Ba thành viên có nền tảng TypeScript và làm việc đều đặn trong 8 tuần.
- Chưa có ngân sách dịch vụ, vì vậy nghiệm thu 8 tuần dành cho bản thử với dữ liệu tổng hợp.
- Các ngưỡng thời gian, khoảng cách và quy mô tải là mặc định thiết kế để triển khai/kiểm thử, cần hiệu chỉnh sau pilot.
- Địa bàn pilot, giá dịch vụ và ngày mở công khai là quyết định của giai đoạn vận hành; không chặn triển khai bản thử.
- Không thay đổi mục tiêu web trước, mobile sau; mọi chức năng mới dùng cùng nền tảng API và mô hình quyền.
