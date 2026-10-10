# Hướng dẫn setup và phát triển Oremus

Tài liệu này dành cho developer thiết lập project lần đầu, chạy môi trường phát triển và sử dụng các lệnh thường gặp.

## 1. Yêu cầu hệ thống

- Git.
- Node.js 22 trở lên và npm.
- Python 3.13 trở lên.
- Docker Desktop có Docker Compose.

Kiểm tra phiên bản:

```powershell
node --version
npm --version
python --version
docker --version
docker compose version
```

## 2. Cấu hình môi trường

Chạy từ thư mục gốc của repository:

```powershell
Copy-Item .env.example .env
```

Mở `.env` và thay `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` bằng hai chuỗi bí mật khác nhau, mỗi chuỗi dài ít nhất 32 ký tự. Có thể tạo một giá trị ngẫu nhiên bằng PowerShell:

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```

Chạy lệnh hai lần và dùng hai kết quả khác nhau.

Các cổng mặc định:

| Service | URL/cổng |
| --- | --- |
| Express web | `http://localhost:3000` |
| FastAPI | `http://localhost:8001` |
| FastAPI OpenAPI | `http://localhost:8001/docs` |
| MongoDB | `localhost:27017` |
| Redis | `localhost:6379` |

## 3. Cách A: chạy toàn bộ bằng Docker

Đây là cách nhanh nhất để chạy đầy đủ hệ thống giống môi trường đóng gói.

### Khởi động

```powershell
docker compose up --build -d
docker compose ps
```

Chạy migration và tạo dữ liệu mẫu:

```powershell
docker compose exec web node dist/scripts/migrate.js
docker compose exec web node dist/scripts/seed.js
```

Mở `http://localhost:3000`. Tài khoản mẫu:

- Email: `maya@example.com`
- Mật khẩu: `CircleSpace123`

### Xem log

```powershell
docker compose logs -f web
docker compose logs -f api
```

Nhấn `Ctrl+C` để dừng theo dõi log; container vẫn tiếp tục chạy.

### Áp dụng thay đổi source code

Docker Compose hiện tại không bind-mount source code. Sau khi sửa code, cần build lại service liên quan:

```powershell
docker compose up -d --build web
docker compose up -d --build api
```

### Dừng hệ thống

```powershell
docker compose down
```

Lệnh trên giữ lại dữ liệu MongoDB, Redis và uploads. Chỉ dùng lệnh sau khi thực sự muốn xóa toàn bộ dữ liệu local:

```powershell
docker compose down -v
```

## 4. Cách B: chạy source local để phát triển

Cách này phù hợp khi cần backend tự reload trong lúc sửa code. MongoDB và Redis vẫn chạy bằng Docker.

### Bước 1: chạy hạ tầng

Nếu trước đó đã chạy toàn bộ stack Docker, dừng hai application container để tránh trùng cổng:

```powershell
docker compose stop web api
```

Sau đó chạy MongoDB và Redis:

```powershell
docker compose up -d mongo redis
```

### Bước 2: cài dependency Node.js

```powershell
npm install
```

### Bước 3: tạo Python virtual environment

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r apps/api/requirements.txt
```

Nếu PowerShell chặn script activate, có thể gọi trực tiếp Python trong virtual environment bằng `.\.venv\Scripts\python.exe`.

### Bước 4: chuẩn bị dữ liệu

```powershell
npm --workspace @oremus/web run migrate
npm run seed
```

### Bước 5: chạy FastAPI

Mở terminal thứ nhất:

```powershell
Set-Location apps/api
python -m uvicorn app.main:app --reload --port 8001
```

### Bước 6: chạy Express web

Mở terminal thứ hai tại thư mục gốc:

```powershell
npm run dev
```

`tsx` sẽ theo dõi thay đổi TypeScript phía server. Khi sửa `apps/web/src/views-or-client/app.ts` hoặc stylesheet, chạy lại lệnh build tương ứng:

```powershell
npm --workspace @oremus/web run build:client
npm --workspace @oremus/web run build:css
```

## 5. Các lệnh dành cho developer

Chạy từ thư mục gốc:

| Mục đích | Lệnh |
| --- | --- |
| Chạy Express ở chế độ dev | `npm run dev` |
| Build web production | `npm run build` |
| Type-check TypeScript | `npm run typecheck` |
| Lint source code | `npm run lint` |
| Chạy test web | `npm test` |
| Chạy test FastAPI | `python -m pytest -q apps/api/tests` |
| Chạy migration MongoDB | `npm --workspace @oremus/web run migrate` |
| Tạo dữ liệu mẫu | `npm run seed` |
| Kiểm tra Docker Compose | `docker compose config --quiet` |
| Xem trạng thái container | `docker compose ps` |

Trước khi bàn giao code, nên chạy:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
python -m pytest -q apps/api/tests
docker compose config --quiet
```

## 6. Cấu trúc chính

```text
apps/
  web/                 Express, EJS, Socket.IO, Mongoose, Tailwind
  api/                 FastAPI ranking và search
docs/                   Tài liệu project
docker-compose.yml      MongoDB, Redis, FastAPI và Express
.env.example            Mẫu biến môi trường
```

Xem thêm [ARCHITECTURE.md](ARCHITECTURE.md) để hiểu data model, route map và cache behavior.

## 7. Xử lý lỗi thường gặp

### Sửa code nhưng Docker vẫn hiển thị phiên bản cũ

Build và khởi động lại container tương ứng:

```powershell
docker compose up -d --build web
```

Sau đó tải lại trang trong trình duyệt.

### Cổng 3000 hoặc 8001 đang được sử dụng

Đổi `WEB_PORT` hoặc `API_PORT` trong `.env`, rồi khởi động lại Docker Compose.

### Web không kết nối được MongoDB hoặc Redis

```powershell
docker compose ps
docker compose logs --tail 100 mongo redis web
```

Khi chạy web local, đảm bảo `MONGODB_URI` và `REDIS_URL` trong `.env` trỏ tới `localhost`, không phải hostname nội bộ Docker.

### Form báo hết hạn

Tải lại trang để nhận CSRF token mới rồi gửi lại form.

### Dữ liệu mẫu bị trùng

Script seed sử dụng upsert nên có thể chạy lại an toàn. Nếu cần môi trường hoàn toàn sạch, dừng stack và xóa volume theo hướng dẫn ở phần Docker; thao tác này xóa toàn bộ dữ liệu local.
