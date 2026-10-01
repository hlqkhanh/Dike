# Giai đoạn 0 — Chuẩn hóa repository, quy trình và bảo mật chuỗi cung ứng

## 1. Mục tiêu và nguyên tắc

Giai đoạn 0 chưa triển khai auth hay nghiệp vụ mới. Mục tiêu là khởi tạo một repository greenfield có thể phát triển lâu dài mà không làm rò rỉ secret, không cho code chưa kiểm tra vào `main` và khóa dependency có thể tái lập. Source prototype cũ đã bị xóa có chủ đích; không có code hoặc dữ liệu legacy cần bảo tồn hay migrate.

Không thể cam kết tuyệt đối “không bị hack”. Giai đoạn này tập trung vào:

- Bảo vệ tài khoản GitHub và nhánh `main`.
- Ngăn secret, dữ liệu cá nhân và artefact local bị commit.
- Giảm rủi ro dependency/package độc hại.
- Không cho CI của pull request không tin cậy tiếp cận secret.
- Bắt buộc lint, typecheck, test, build và security scan trước merge.
- Ghi lại các quyết định kiến trúc để tránh thay đổi tùy tiện.

Repo được chốt là:

- GitHub repository công khai.
- Không cấp giấy phép open-source; người khác được xem code nhưng không mặc nhiên có quyền sử dụng.
- Mọi thay đổi vào `main` qua pull request.
- Cần ít nhất một approval và toàn bộ CI xanh.
- Không bắt buộc ký từng commit.
- Baseline tài liệu greenfield được giữ bằng annotated Git tag; không tạo tag giả danh source prototype.
- Node.js 22 và pnpm 10 được dùng thống nhất.

---

## 2. Backlog chi tiết

### G0-01 — Xác nhận baseline greenfield và phạm vi khởi tạo

**Phụ thuộc:** Không có.

**Công việc:**

- Lập danh sách toàn bộ tài liệu hiện có và xác nhận workspace không còn source ứng dụng.
- Ghi rõ việc xóa source cũ là quyết định có chủ đích; không tìm cách phục hồi hoặc mô phỏng lịch sử code không còn tồn tại.
- Xác nhận các phần sau không được đưa vào repository khi chúng xuất hiện trong các giai đoạn sau:
  - `node_modules/`
  - `.next/`
  - `dist/`
  - `coverage/`
  - file log
  - `.env*` thật
  - `apps/api/data/demo.json`
  - file chứng thư/khóa như `*.pem`, `*.key`, `*.p12`
- Kiểm tra `plan/PLAN.md` và `plan/STAGE_0.md` để loại:
  - Số điện thoại hoặc email cá nhân.
  - API key hoặc credential.
  - Đường dẫn máy cá nhân.
  - URL quản trị hoặc thông tin hạ tầng riêng.
  - Giấy tờ/ảnh người thật.
- Xác nhận không có dữ liệu demo hoặc dữ liệu người dùng cũ cần migrate; seed tương lai phải là dữ liệu tổng hợp mới.
- Ghi baseline:
  - Node version.
  - Package manager hiện có/không có.
  - Hai tài liệu đầu vào duy nhất.
  - Trạng thái chưa có Git, package manifest, source và test.
  - Các giới hạn của baseline greenfield.

**Đầu ra:**

- `docs/baseline/greenfield-inventory.md`.
- Checklist xác nhận không có source/dữ liệu legacy và tài liệu không chứa dữ liệu cá nhân thật.
- Danh sách các file được phép xuất hiện trong commit đầu tiên.

**Nghiệm thu:**

- Không phát hiện credential hoặc dữ liệu cá nhân thật trong tập file chuẩn bị commit.
- Baseline ghi đúng rằng chưa có ứng dụng để build/test.
- Không tài liệu nào khiến người đọc hiểu nhầm source prototype vẫn còn hoặc hệ thống đã production-ready.

---

### G0-02 — Quét secret trước khi tạo lịch sử Git công khai

**Phụ thuộc:** G0-01.

**Công việc:**

- Chạy Gitleaks trên toàn bộ workspace, bao gồm cả file chưa được Git theo dõi.
- Chạy tìm kiếm bổ sung cho:
  - `api_key`, `client_secret`, `password`, `token`.
  - JWT.
  - Private key.
  - MongoDB URI.
  - Redis URI.
  - AWS/S3/R2 credential.
  - Google OAuth secret.
- Kiểm tra thủ công các giá trị có entropy cao mà scanner báo.
- Phân loại từng kết quả:
  - Secret thật.
  - Secret đã hết hạn.
  - Dữ liệu mẫu.
  - False positive.
- Nếu phát hiện secret thật:
  1. Dừng việc tạo/push repository.
  2. Thu hồi hoặc rotate secret ở nhà cung cấp.
  3. Xóa khỏi file local.
  4. Quét lại từ đầu.
- Không chỉ “xóa secret khỏi file”; secret đã từng được đưa lên GitHub phải được coi là đã lộ.

**Đầu ra:**

- Báo cáo scan không chứa giá trị secret.
- Danh sách false positive được giải thích.
- Quy trình xử lý secret leak trong `SECURITY.md`.

**Nghiệm thu:**

- Gitleaks trả kết quả sạch.
- Không có `.env`, private key hoặc connection string thật trong tập commit.
- Không push GitHub trước khi task này đạt.

---

### G0-03 — Chuẩn hóa file hygiene và tính nhất quán

**Phụ thuộc:** G0-02.

**Công việc:**

- Mở rộng `.gitignore` để bao phủ:
  - Dependency và package-manager cache.
  - `.next`, `dist`, `coverage`, `playwright-report`.
  - Log, PID, temp file.
  - `.env`, `.env.*`, ngoại trừ `.env.example`.
  - IDE user settings.
  - Local MongoDB/Redis/MinIO volumes.
  - Dữ liệu runtime `apps/api/data/`.
- Tạo `.gitattributes`:
  - Chuẩn hóa text về LF.
  - Đánh dấu file binary.
  - Tránh diff cho lockfile generated không cần thiết.
- Tạo `.editorconfig`:
  - UTF-8.
  - LF.
  - Final newline.
  - Hai khoảng trắng cho TypeScript/JSON/YAML.
  - Không có trailing whitespace.
- Tạo `.env.example` chỉ chứa:
  - Tên biến.
  - Giá trị giả vô hại.
  - Mô tả biến bắt buộc/tùy chọn.
  - Không dùng secret có hình thức giống credential thật.
- Kiểm tra bằng `git check-ignore` rằng toàn bộ artefact nhạy cảm/generated thực sự bị bỏ qua.
- Không commit cấu hình IDE cá nhân; chỉ commit workspace setting nếu nó áp dụng thống nhất cho cả nhóm.

**Đầu ra:**

- `.gitignore`, `.gitattributes`, `.editorconfig`.
- `.env.example`.
- Quy tắc đặt tên biến môi trường.

**Nghiệm thu:**

- `node_modules`, `.next`, `dist`, demo runtime data và `.env` không xuất hiện trong `git status`.
- File source được chuẩn hóa LF trên Windows và CI Linux.
- Fresh clone không cần lấy bất kỳ secret nào để cài dependency và chạy quality/security checks; unit test ứng dụng bắt đầu từ Giai đoạn 1.

---

### G0-04 — Khởi tạo Git và lưu baseline kế hoạch

**Phụ thuộc:** G0-03.

**Công việc:**

- Khởi tạo repository với nhánh mặc định `main`.
- Commit baseline bằng message:
  - `chore: initialize greenfield repository`
- Commit chỉ chứa tài liệu và file cấu hình an toàn của repository greenfield.
- Tạo annotated tag:
  - `planning-v0.1.0`
- Nội dung tag ghi rõ:
  - Source cũ đã bị xóa có chủ đích.
  - Tag chỉ chứa baseline kế hoạch greenfield.
  - Chưa có ứng dụng chạy được hoặc dữ liệu cần migrate.
- Không tạo branch prototype; annotated tag chỉ đánh dấu thời điểm chốt kế hoạch ban đầu.
- Kiểm tra có thể checkout tag và đọc đầy đủ hai tài liệu kế hoạch.
- Sau đó mới tạo GitHub repository public và push `main` cùng tag.
- Không dùng force push cho lần khởi tạo lại lịch sử sau khi repo đã public.

**Đầu ra:**

- Git history ban đầu.
- Annotated tag `planning-v0.1.0`.
- GitHub repository public.

**Nghiệm thu:**

- `git status` sạch sau commit.
- Tag checkout được độc lập.
- Tag không chứa source giả lập, `node_modules`, build output, runtime data hoặc secret.
- Tag phản ánh đúng baseline greenfield và không tuyên bố có thể phục hồi prototype.

---

### G0-05 — Thiết lập quyền GitHub và bảo vệ tài khoản

**Phụ thuộc:** G0-04.

**Công việc:**

- Mời đúng ba thành viên bằng tài khoản riêng; cấm dùng tài khoản chia sẻ.
- Tất cả thành viên phải bật GitHub 2FA.
- Chỉ cấp quyền cần thiết:
  - Tối đa hai người giữ quyền Admin để tránh mất quyền truy cập.
  - Thành viên còn lại giữ quyền Write/Maintain.
  - Không cấp quyền Admin cho bot.
- Rà soát OAuth Apps, GitHub Apps và personal access token của từng thành viên.
- Personal access token phải:
  - Fine-grained.
  - Có expiration.
  - Chỉ truy cập repository cần thiết.
- Bật private vulnerability reporting cho repo public.
- Không công khai email cá nhân trong commit; dùng GitHub no-reply email nếu cần.
- Ghi người chịu trách nhiệm xử lý security alert, dependency alert và access review.
- Thực hiện access review mỗi tháng trong thời gian pilot.

**Đầu ra:**

- Danh sách thành viên và quyền.
- Checklist xác nhận 2FA.
- Security ownership matrix.

**Nghiệm thu:**

- Không có tài khoản chia sẻ.
- Không có collaborator không rõ mục đích.
- Có ít nhất hai người có khả năng khôi phục quyền quản trị.
- Mỗi security alert có người chịu trách nhiệm.

---

### G0-06 — Khởi tạo pnpm workspace có thể tái lập

**Phụ thuộc:** G0-04.

**Công việc:**

- Dùng Node.js 22; khai báo `engines` là `>=22 <23`.
- Dùng pnpm 10 và pin chính xác phiên bản trong trường `packageManager`.
- Tạo `pnpm-workspace.yaml` bao gồm:
  - `apps/*`
  - `packages/*`
- Không tạo `package-lock.json`; chỉ tạo `pnpm-lock.yaml` hợp lệ.
- Không giữ đồng thời nhiều lockfile.
- Cấu hình:
  - CI dùng `pnpm install --frozen-lockfile`.
  - Dependency mới phải được ghi vào manifest của đúng workspace.
  - Dependency version được pin có kiểm soát.
  - Lifecycle/build script của dependency bị hạn chế; chỉ allowlist package đã review.
- Chuẩn hóa root scripts:

```text
pnpm dev
pnpm build
pnpm test
pnpm lint
pnpm typecheck
pnpm format
pnpm format:check
pnpm security:secrets
pnpm security:audit
pnpm run ci
```

- `pnpm run ci` chạy tuần tự: format check → lint → typecheck → test → build.
- Tạo trước các thư mục `apps/`, `packages/`, `infra/`, `docs/` bằng file giữ chỗ hoặc README có mục đích rõ; chưa scaffold Next.js/NestJS ở giai đoạn này.
- Các script `test`, `typecheck` và `build` phải chạy an toàn khi chưa có workspace ứng dụng, đồng thời tự động bao phủ workspace được thêm ở Giai đoạn 1.

**Đầu ra:**

- `pnpm-workspace.yaml`.
- `pnpm-lock.yaml`.
- Root scripts chuẩn.
- Tài liệu cài đặt pnpm qua Corepack.

**Nghiệm thu:**

- Fresh clone cài được bằng frozen lockfile.
- `package-lock.json` không được tạo.
- Root quality/security checks chạy được dù chưa có API và web.
- Cài đặt lần hai không làm thay đổi lockfile.
- Không có dependency lifecycle script chưa được phê duyệt.

---

### G0-07 — ESLint, Prettier và TypeScript strict gate

**Phụ thuộc:** G0-06.

**Công việc:**

- Dùng ESLint flat config cho TypeScript, NestJS, React và Next.js.
- Bật các nhóm rule:
  - Type-aware correctness.
  - Promise handling.
  - Import consistency.
  - React hooks.
  - Không dùng `eval` hoặc dynamic code execution.
  - Cảnh báo sử dụng `any`.
  - Không log tùy tiện bằng `console` trong production code.
- Dùng Prettier làm formatter duy nhất.
- Không để ESLint và Prettier cùng xử lý formatting.
- Tạo root TypeScript base config dùng chung.
- Giữ `strict: true`.
- Mỗi workspace có script `lint`, `typecheck`, `test`, `build`.
- Baseline hiện tại phải được làm sạch; không thêm hàng loạt `eslint-disable`.
- Mỗi disable bắt buộc có lý do trên cùng dòng hoặc dòng ngay trước.

**Đầu ra:**

- ESLint flat config.
- Prettier config và ignore.
- Shared TypeScript config.
- Scripts nhất quán giữa workspace.

**Nghiệm thu:**

- `pnpm lint`, `pnpm typecheck`, `pnpm format:check` đều thành công.
- Không có warning bị bỏ qua trong CI.
- Không tạo code nghiệp vụ hoặc ứng dụng giả chỉ để làm cho CI xanh.

---

### G0-08 — Commit hooks và quy ước commit

**Phụ thuộc:** G0-07.

**Công việc:**

- Cài Husky, lint-staged và Commitlint.
- Pre-commit hook chỉ chạy nhanh:
  - Prettier trên file staged phù hợp.
  - ESLint trên TypeScript/JavaScript staged.
  - Secretlint trên nội dung staged.
- Commit-msg hook kiểm tra Conventional Commits.
- Các prefix được phép:
  - `feat`, `fix`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`, `security`.
- Không đưa test/build đầy đủ vào pre-commit vì quá chậm; CI mới là gate authoritative.
- Ghi rõ hook local có thể bị bypass nên không được xem là biện pháp bảo mật duy nhất.
- Cấm hook tự sửa file ngoài tập staged.

**Đầu ra:**

- Husky hooks.
- lint-staged và Commitlint config.
- Hướng dẫn commit trong `CONTRIBUTING.md`.

**Nghiệm thu:**

- Commit chứa secret mẫu bị từ chối.
- Commit sai format bị từ chối.
- Commit hợp lệ không sửa file không liên quan.
- CI vẫn phát hiện lỗi khi hook bị bypass bằng `--no-verify`.

---

### G0-09 — GitHub Ruleset cho `main`

**Phụ thuộc:** G0-05 và G0-08.

**Công việc:**

- Tạo ruleset áp dụng cho `main`.
- Bắt buộc pull request trước khi merge.
- Bắt buộc một approval.
- Người push commit cuối không được tự approve thay đổi của mình.
- Dismiss approval cũ khi có commit mới.
- Bắt buộc resolve toàn bộ conversation.
- Bắt buộc required status checks:
  - `quality`
  - `test`
  - `build`
  - `secret-scan`
  - `dependency-review`
  - `codeql`
- Bắt buộc branch được cập nhật với `main` trước khi merge.
- Bật linear history.
- Chỉ cho squash merge.
- Tắt merge commit và rebase merge.
- Cấm force push và xóa `main`.
- Không cho Admin bypass trong hoạt động bình thường.
- Tự động xóa feature branch sau merge.
- CODEOWNERS:
  - Thay đổi `.github/workflows/**` cần project maintainer review.
  - Thay đổi security/config/dependency cần backend hoặc security owner review.
- GitHub hỗ trợ chặn merge khi thiếu review hoặc CI và cấm force-push/xóa protected branch; dùng ruleset này làm enforcement, không chỉ viết thành quy ước ([GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)).

**Đầu ra:**

- `CODEOWNERS`.
- Ruleset `main-protection`.
- Tài liệu emergency bypass.

**Nghiệm thu:**

- Push trực tiếp vào `main` bị từ chối.
- PR chưa review không merge được.
- PR có CI fail không merge được.
- Commit mới làm approval cũ mất hiệu lực.
- Không thể force-push hoặc xóa `main`.

---

### G0-10 — CI chất lượng cơ bản

**Phụ thuộc:** G0-06 và G0-07.

**Công việc:**

- Tạo workflow chạy trên:
  - Pull request vào `main`.
  - Push vào `main`.
- CI chạy Ubuntu với Node 22 và pnpm đã pin.
- Dùng cache pnpm theo lockfile.
- Bắt buộc frozen lockfile.
- Chia job:
  - `quality`: format check, lint, typecheck.
- `test`: chạy test của workspace nếu có; Giai đoạn 0 phải báo rõ chưa có test ứng dụng thay vì giả kết quả.
- `build`: chạy build của workspace nếu có; Giai đoạn 0 chỉ kiểm tra workspace/configuration.
- Đặt timeout cho từng job để tránh workflow treo.
- Dùng concurrency group và hủy run cũ của cùng PR.
- Upload test report khi thất bại, không upload `.env` hoặc workspace toàn bộ.
- `GITHUB_TOKEN` mặc định chỉ có `contents: read`.
- Không truyền secret vào workflow kiểm tra pull request.
- Không dùng `pull_request_target` để checkout và chạy code từ contributor.
- Action bên thứ ba phải được pin bằng full commit SHA, không chỉ `@v4`.
- Không interpolate trực tiếp title/body/branch name của PR vào shell command.
- Không thêm deploy vào workflow Giai đoạn 0.

**Đầu ra:**

- CI workflow.
- Required check names ổn định.
- README badge build status.

**Nghiệm thu:**

- PR hợp lệ chạy đủ các job.
- PR từ fork không đọc được repository secret.
- Lỗi lint, test, build hoặc cấu hình workspace chặn merge; khi Giai đoạn 1 thêm app, các job tự động trở thành gate thật cho app.
- Workflow không có quyền ghi repository.

---

### G0-11 — Security pipeline và dependency governance

**Phụ thuộc:** G0-10.

**Công việc:**

- Bật GitHub Secret Scanning và Push Protection; secret scanning chạy tự động cho public repository ([GitHub secret scanning](https://docs.github.com/en/code-security/concepts/secret-security/about-alerts)).
- Thêm Gitleaks CI:
  - Scan toàn bộ Git history.
  - Fail khi phát hiện secret chưa được allowlist có lý do.
- Bật CodeQL cho JavaScript/TypeScript:
  - Pull request.
  - Push `main`.
  - Lịch chạy hàng tuần.
- Bật dependency review trên pull request.
- Chạy `pnpm audit --prod`.
- High/critical vulnerability chặn merge, trừ khi có security exception gồm:
  - CVE/advisory.
  - Phân tích ảnh hưởng.
  - Biện pháp giảm thiểu.
  - Owner.
  - Ngày hết hạn tối đa 30 ngày.
- Tạo Dependabot:
  - npm/pnpm dependency hàng tuần.
  - GitHub Actions hàng tuần.
  - Patch/minor có thể nhóm theo ecosystem.
  - Major update phải là PR riêng.
- Sinh SBOM CycloneDX từ lockfile và lưu dưới dạng CI artifact.
- Action/workflow không dùng secret dài hạn cho cloud; giai đoạn deploy sau dùng OIDC khi provider hỗ trợ. GitHub khuyến nghị OIDC và các biện pháp hardening cho workflow có quyền nhạy cảm ([GitHub Actions security](https://docs.github.com/en/actions/how-tos/secure-your-work?tool=cli)).

**Đầu ra:**

- Secret scanning, Gitleaks, CodeQL, dependency review.
- Dependabot configuration.
- Vulnerability exception template.
- SBOM artifact.

**Nghiệm thu:**

- Commit chứa fake provider token đã biết bị push protection hoặc CI chặn.
- Dependency high/critical làm PR fail.
- CodeQL result xuất hiện trong Security tab.
- Không có workflow action tham chiếu floating tag.
- Security exception hết hạn tự trở thành blocker.

---

### G0-12 — Tài liệu security và contribution cho repo public

**Phụ thuộc:** G0-05 và G0-11.

**Công việc:**

- Tạo `SECURITY.md`:
  - Báo cáo lỗ hổng bằng GitHub private vulnerability reporting.
  - Không báo lỗ hổng bằng public issue.
  - Không đăng secret hoặc dữ liệu cá nhân trong issue.
  - Mức độ ưu tiên phản hồi.
  - Quy trình rotate credential.
- Tạo `CONTRIBUTING.md`:
  - Setup Node/pnpm.
  - Branch naming.
  - Commit convention.
  - PR checklist.
  - Test bắt buộc.
  - Security checklist.
- Vì không cấp license:
  - Tạo thông báo `All Rights Reserved`.
  - Ghi rõ repository public để tham khảo.
  - Không mặc nhiên cho phép sao chép, phân phối hoặc sử dụng thương mại.
  - Chưa nhận external code contribution trong pilot để tránh tranh chấp quyền sở hữu.
- Không gắn nhãn MIT, Apache hoặc Open Source.
- Tạo issue template:
  - Bug.
  - Feature.
  - Technical task.
  - Security task nội bộ không chứa chi tiết khai thác.
- Tạo PR template có checklist:
  - Không có secret/PII.
  - Có test.
  - Có thay đổi tài liệu.
  - Có migration/rollback nếu cần.
  - Đã xem xét quyền truy cập.
- Tạo `CODE_OF_CONDUCT.md` nếu repo mở issue công khai.

**Đầu ra:**

- `SECURITY.md`, `CONTRIBUTING.md`, ownership notice.
- Issue/PR templates.
- Public repository disclosure rules.

**Nghiệm thu:**

- Người ngoài biết cách báo lỗ hổng riêng tư.
- README không khiến người đọc hiểu nhầm đây là phần mềm open-source.
- PR template buộc tác giả tự kiểm tra secret, test và security impact.

---

### G0-13 — Viết Architecture Decision Records

**Phụ thuộc:** Có thể chạy song song từ G0-06.

Mỗi ADR phải có: status, context, decision, alternatives, consequences, security impact, migration/rollback và ngày review.

**ADR bắt buộc:**

1. `ADR-0001 — Modular monolith`
   - Một API NestJS chia module.
   - Worker tách process nhưng dùng chung domain contract.
   - Không dùng microservice trong pilot.

2. `ADR-0002 — MongoDB Atlas`
   - Mongoose.
   - Replica set để hỗ trợ transaction.
   - Không dùng JSON store trong production.
   - Không migrate demo JSON.

3. `ADR-0003 — Authentication`
   - Google login trước.
   - Thu số điện thoại sau onboarding.
   - Development có thể chưa bắt OTP.
   - Production pilot bắt buộc OTP trước thao tác nghiệp vụ nhạy cảm.

4. `ADR-0004 — File storage`
   - Cloudflare R2.
   - Bucket avatar public và hồ sơ private.
   - MongoDB chỉ lưu metadata.
   - Private file dùng signed URL ngắn hạn.

5. `ADR-0005 — Deployment`
   - Web trên Vercel.
   - API/worker/cron trên Render.
   - MongoDB Atlas, Render Key Value và R2.
   - Staging/production tách secret và dữ liệu.

6. `ADR-0006 — Repository và supply-chain security`
   - Public repository, all rights reserved.
   - PR + một review.
   - CI least privilege.
   - Lockfile bắt buộc.
   - Secret scanning/CodeQL/dependency review.

**Nghiệm thu:**

- Không ADR nào chỉ ghi lựa chọn mà thiếu tradeoff và security impact.
- Các ADR không mâu thuẫn với README, PLAN hoặc backlog.
- Thay đổi quyết định sau này phải tạo ADR mới thay thế, không âm thầm sửa lịch sử.

---

### G0-14 — Chuyển PLAN thành backlog triển khai

**Phụ thuộc:** G0-13.

**Công việc:**

- Tạo GitHub milestones theo từng giai đoạn.
- Tạo label chuẩn:
  - `type:feature`, `type:bug`, `type:security`, `type:tech-debt`.
  - `area:web`, `area:api`, `area:worker`, `area:mobile`, `area:infra`.
  - `priority:p0` đến `priority:p3`.
  - `status:blocked`.
- Tạo project board:
  - Backlog.
  - Ready.
  - In Progress.
  - Review.
  - Done.
  - Blocked.
- Mỗi task phải có:
  - Mục tiêu.
  - Phụ thuộc.
  - Hành vi cần triển khai.
  - Security considerations.
  - Test cases.
  - Acceptance criteria.
  - Out-of-scope.
- Mapping toàn bộ mục trong `PLAN.md` sang task/milestone.
- Task chưa rõ không được chuyển sang `Ready`.
- Ghi ngoài phạm vi rõ ràng:
  - Thanh toán trong ứng dụng.
  - Ví, thu hộ, hoàn tiền, đối soát.
  - Group chat.
  - Voice/video call.
  - Điều phối quy mô lớn.
  - Microservices/Kubernetes.
  - GPS nền trên web.
  - Dùng dữ liệu eKYC thật khi chưa duyệt pháp lý.

**Đầu ra:**

- Milestones và project board.
- Backlog có dependency.
- Scope statement thống nhất.

**Nghiệm thu:**

- Mỗi yêu cầu trong PLAN có ít nhất một task hoặc được đánh dấu ngoài phạm vi.
- Không có task “implement feature” chung chung thiếu acceptance criteria.
- Security task không bị trộn và che khuất trong feature task.

---

### G0-15 — Kiểm thử hoàn tất Giai đoạn 0

**Phụ thuộc:** Tất cả task trên.

**Kịch bản kiểm thử:**

1. Fresh clone baseline greenfield trên máy sạch.
2. Kích hoạt đúng Node/pnpm.
3. `pnpm install --frozen-lockfile`.
4. `pnpm run ci`.
5. Xác nhận `pnpm dev` thông báo rõ ứng dụng chưa được scaffold, không giả vờ khởi động thành công.
6. Thử commit sai format.
7. Thử commit secret mẫu.
8. Thử push trực tiếp vào `main`.
9. Thử merge PR chưa review.
10. Thử merge PR có CI fail.
11. Thử PR từ fork đọc secret.
12. Checkout `planning-v0.1.0` và xác nhận baseline chỉ gồm kế hoạch/config greenfield.
13. Kiểm tra Git history bằng Gitleaks.
14. Kiểm tra dependency, CodeQL và SBOM.
15. Kiểm tra README/SECURITY từ góc nhìn người ngoài.

**Báo cáo cuối giai đoạn phải ghi:**

- Commit/tag baseline greenfield.
- Các CI checks đang bắt buộc.
- Kết quả secret scan.
- Kết quả vulnerability scan.
- Danh sách dependency exception nếu có.
- Thành viên và quyền GitHub.
- Các ADR được chấp nhận.
- Backlog/milestone đã tạo.
- Rủi ro còn lại chuyển sang Giai đoạn 1.

---

## 3. Developer interface sau Giai đoạn 0

Giai đoạn này không thay đổi REST API hoặc hành vi nghiệp vụ. Interface mới dành cho developer:

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm build
pnpm test
pnpm lint
pnpm typecheck
pnpm format
pnpm format:check
pnpm security:secrets
pnpm security:audit
pnpm run ci
```

Quy trình thay đổi code:

```text
Issue → feature branch → commit hooks → pull request
→ CI/security checks → 1 approval → squash merge → main
```

Không có lệnh deploy production trong Giai đoạn 0.

---

## 4. Definition of Done

Giai đoạn 0 chỉ hoàn thành khi:

- Repo GitHub public đã tồn tại và không chứa secret/PII.
- Baseline kế hoạch được bảo toàn tại tag `planning-v0.1.0`; không tồn tại tag prototype giả.
- Repo chỉ có một lockfile pnpm.
- Fresh clone cài dependency và chạy quality/security checks thành công; test/build app chỉ trở thành bắt buộc sau khi app được scaffold ở Giai đoạn 1.
- Push trực tiếp, force push và xóa `main` bị chặn.
- PR cần một reviewer khác và toàn bộ required checks.
- CI chạy với quyền read-only và không cấp secret cho code từ fork.
- Secret scanning, Gitleaks, CodeQL, dependency review và Dependabot hoạt động.
- High/critical dependency vulnerability không thể bị bỏ qua âm thầm.
- ADR cho sáu quyết định kiến trúc đã được review.
- PLAN đã được chuyển thành backlog có dependency và acceptance criteria.
- README nêu rõ dự án đang khởi tạo greenfield và chưa production-ready.
- Repository ghi rõ “All Rights Reserved”, không tự nhận là open-source.
- Không còn quyết định kỹ thuật chưa chốt cho Giai đoạn 1.

## 5. Giả định đã khóa

- Nhóm có ba thành viên.
- Node.js 22 được giữ nguyên.
- Khởi tạo repository mới bằng pnpm 10; không có package manager legacy cần migrate.
- Repository công khai.
- Không cấp license sử dụng source.
- External pull request chưa được nhận trong pilot.
- Không bắt buộc signed commit.
- Tất cả thành viên dùng 2FA và tài khoản riêng.
- Không còn source hoặc dữ liệu JSON cũ; không có migration legacy. Seed tương lai phải là dữ liệu tổng hợp mới.
- Giai đoạn 0 không triển khai database, auth, Docker infrastructure hoặc feature mới.
