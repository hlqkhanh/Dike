import { FoundationStatus } from '../components/foundation-status';

export default function HomePage() {
  return (
    <>
      <header className="shell header">
        <div className="brand">
          <span className="brand-mark">D</span> Dike
        </div>
        <small>Nền tảng đi chung xe cộng đồng</small>
      </header>
      <main className="shell hero">
        <div>
          <p className="eyebrow">Greenfield foundation</p>
          <h1>Đi chung một đoạn. Gần nhau thêm một chút.</h1>
          <p className="lead">
            Dike đang xây dựng nền tảng an toàn để kết nối người có cùng tuyến đường và thời gian di
            chuyển. Stage 1 thiết lập web, API, worker và hạ tầng local có thể kiểm chứng.
          </p>
        </div>
        <FoundationStatus />
      </main>
    </>
  );
}
