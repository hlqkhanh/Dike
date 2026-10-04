import { POLICY_VERSION } from '@dike/contracts';
import { AuthShell } from '../../components/auth/auth-shell';
import { Card } from '@dike/ui';
export default function PoliciesPage() {
  return (
    <AuthShell>
      <div className="profile-settings">
        <h1>Điều khoản và quyền riêng tư</h1>
        <Card>
          <p>Phiên bản {POLICY_VERSION} — bản thử nghiệm, chưa được phê duyệt để mở pilot.</p>
          <h2>Điều khoản thử nghiệm</h2>
          <p>
            Ứng dụng dành cho người từ 18 tuổi. Chỉ dùng dữ liệu thử nghiệm; không tải giấy tờ tùy
            thân thật, dữ liệu của người khác hoặc nội dung trái phép. Chức năng ghép chuyến và xác
            minh danh tính chưa được cung cấp trong giai đoạn này.
          </p>
          <h2>Dữ liệu và quyền riêng tư</h2>
          <p>
            Hệ thống lưu danh tính đăng nhập Google, số điện thoại đã mã hóa, phiên đăng nhập, hồ sơ
            bạn nhập, lựa chọn quyền riêng tư và lịch sử đồng ý. Số điện thoại và email không có
            trong hồ sơ cho thành viên xem.
          </p>
          <p>
            Ảnh đại diện có URL công khai. Các ảnh xác minh giả lập chỉ chủ tài khoản được yêu cầu
            liên kết tải ngắn hạn. Có thể đổi quyền xem hồ sơ, tắt tìm kiếm và tắt đồng ý phân tích
            tùy chọn. Hiện chưa thu thập analytics.
          </p>
          <h2>Lưu trữ và xóa</h2>
          <p>
            Upload chưa hoàn tất hết hạn sau 15 phút; ảnh xác minh giả lập được giữ tối đa 30 ngày.
            Khi yêu cầu xóa tài khoản, tài khoản bị khóa ngay và dữ liệu hồ sơ/đăng nhập được xóa
            sau 7 ngày. Dấu vết bảo mật tối thiểu được giữ thêm 90 ngày. Xóa ở nguồn không thu hồi
            được bản sao ảnh công khai hoặc backup đã tạo; quy trình backup và hỗ trợ cần được phê
            duyệt trước pilot.
          </p>
          <a href="/settings/profile">Quản lý lựa chọn dữ liệu</a>
        </Card>
      </div>
    </AuthShell>
  );
}
