# 🌊 น้ำสามวา (SamWa WaterWatch) - ระบบมอนิเตอร์ระดับน้ำและเตือนภัยฉุกเฉิน
### Full-Stack Edge on Cloudflare Pages & Real-time Visual Flood Monitor

เว็บแอปพลิเคชัน Real-time สำหรับตรวจสอบระดับน้ำและเตือนภัยฉุกเฉิน 9 สถานีตรวจวัดหลักในพื้นที่คลองสามวา สายไหม ลำลูกกา และจุดยุทธศาสตร์ระบายน้ำกรุงเทพมหานคร พร้อมระบบการแสดงผลแบบ **Visual Alerts 100%** (ไม่พึ่งพาเสียง) และสถาปัตยกรรม **Full-Stack Edge บน Cloudflare Pages Functions** ที่รองรับผู้ใช้งานพร้อมกันหลักหมื่นคนด้วยระบบ **Edge CDN Caching**

---

## 📌 จุดตรวจวัดระดับน้ำ 9 สถานีหลัก (ST-1 ถึง ST-9)

| รหัส | ชื่อสถานี | พิกัด (Lat, Lng) | ระดับวิกฤติ (ม.รทก.) | ระดับตลิ่ง (ม.รทก.) | แหล่งข้อมูล |
|:---:|---|:---:|:---:|:---:|:---:|
| **ST-1** | คลองหกวา ลำลูกกา คลอง 8 (ปทุมธานี) | 13.9372, 100.7712 | 2.50 | 2.71 | Thaiwater (BKK015 / ID: 37) |
| **ST-2** | คลองหกวา ตอนคลอง 9 | 13.9317, 100.7933 | 1.80 | 2.30 | กทม. Weather (ID: 35) |
| **ST-3** | คลองพระยาสุเรนทร์ ตอนคลองหนองระแหง (จตุโชติ) | 13.8967, 100.6865 | 1.20 | 1.60 | กทม. Weather (ID: 126) |
| **ST-4** | ปตร.คลองแปดสายล่าง (คลองหกวา) | 13.9338, 100.7788 | 1.90 | 2.30 | กทม. Waterflow (BMA) |
| **ST-5** | ปตร.คลองเก้าสายล่าง (คลองหกวา) | 13.9287, 100.8033 | 1.80 | 2.30 | กทม. Waterflow (BMA) |
| **ST-6** | สถานีสูบน้ำคลองนิมิตใหม่ (ปตร.ปากคลองสามวา) | 13.8825, 100.7258 | 0.90 | 1.30 | กทม. Waterflow (BMA) |
| **ST-7** | คลองพระยาสุเรนทร์ ตอนวัดพระยาสุเรนทร์ | 13.8683, 100.7025 | 1.00 | 1.40 | กทม. Weather (ID: 125) |
| **ST-8** | คลองสามวา ตอนวัดสามง่าม | 13.8458, 100.7233 | 0.80 | 1.20 | กทม. Weather (ID: 130) |
| **ST-9** | **ประตูระบายน้ำคลองสามวา (Sluice Gate ID 21)** | 13.8817, 100.7289 | ใน: 0.80 / นอก: 1.30 | ใน: 1.30 / นอก: 1.70 | กทม. Weather (ID: 21) |

> [!NOTE]
> **พิเศษสำหรับสถานี ST-9 (ปตร.คลองสามวา):** แสดงผลระดับน้ำ 2 ฝั่งแยกอิสระ (**ด้านใน** เทียบเกณฑ์วิกฤติ 0.80 ม. / ตลิ่ง 1.30 ม. และ **ด้านนอก** เทียบเกณฑ์วิกฤติ 1.30 ม. / ตลิ่ง 1.70 ม.) พร้อมคำนวณส่วนต่างระดับน้ำ (Diff In/Out) และระยะเปิดบานประตูน้ำอัตโนมัติ

---

## ⚡ สถาปัตยกรรม Full-Stack Edge (Cloudflare Pages)

```
[ผู้ใช้งานนับหมื่นคนทั่วประเทศ]
             │
             ▼ HTTPS
┌────────────────────────────────────────────────────────┐
│             Cloudflare Global Edge Network             │
│                                                        │
│  [ public/ ] Static Assets (HTML, CSS, JS, Images)    │
│                                                        │
│  [ functions/api/water-summary.js ]                    │
│   ├── 1. Check Cloudflare Cache API (caches.default)   │
│   │      └─ HIT: ส่งกลับ JSON ทันที (< 20ms)            │
│   └── 2. MISS: เรียก Scraper แบบ Native fetch()        │
│          ├── Thaiwater API                             │
│          ├── BMA Weather Portal (ID: 21, 35, 125, 126, 130)
│          └── BMA Waterflow Portal                      │
│          └─ บันทึกลง CDN Cache (TTL: 120s)              │
└────────────────────────────────────────────────────────┘
```

### ทำไมระบบถึงรับมือผู้ใช้พร้อมกันหลักหมื่นคนได้?
1. **Zero Origin Slamming (Edge Caching 120s):**
   - API ส่ง Header: `Cache-Control: public, max-age=120, s-maxage=120, stale-while-revalidate=300`
   - เมื่อมีผู้ใช้เข้าใช้งาน คนแรกจะ Trigger ให้ Edge Scrape ข้อมูล ส่วนผู้ใช้คนที่ 2 ถึง 50,000 คนถัดไปภายใน 2 นาที จะได้รับข้อมูลจาก Data Center ของ Cloudflare ใกล้บ้านทันทีโดยตรง ไม่ส่งภาระไปยังเซิร์ฟเวอร์ กทม. หรือ Thaiwater
2. **Serverless V8 Isolates:**
   - Pages Functions รันบน V8 Isolates ทั่วโลก ไม่มี Cold Start และไม่ต้องรันเซิร์ฟเวอร์เปิดทิ้งไว้ตลอด 24 ชม.
3. **Decoupled Relative API:**
   - หน้าเว็บเรียก `/api/water-summary` โดยตรง ไม่ผูกติดกับ localhost หรือโดเมนเฉพาะ

---

## 🚀 วิธีการ Deploy ขึ้น Cloudflare Pages

### วิธีที่ 1: Deploy ผ่าน Cloudflare Dashboard (แนะนำสำหรับเชื่อม Git)
1. ทำการ Push โค้ดทั้งหมดขึ้น **GitHub** หรือ **GitLab**
2. ไปที่ **Cloudflare Dashboard** -> **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**
3. เลือก Repository ของคุณ
4. ตั้งค่า Build Settings:
   - **Framework preset:** `None`
   - **Build command:** *(เว้นว่างไว้ หรือใส่ `npm run build`)*
   - **Build output directory:** `public`
5. คลิก **Save and Deploy**
   - Cloudflare จะ Deploy หน้าเว็บ Static จากโฟลเดอร์ `public/` และเชื่อมโยง Pages Functions จากโฟลเดอร์ `functions/` ให้อัตโนมัติทันที

---

### วิธีที่ 2: Deploy ผ่าน Wrangler CLI (Deploy จากเครื่องโดยตรง)
คุณสามารถสั่ง Deploy ขึ้น Cloudflare Pages ได้โดยตรงจาก Terminal:

1. ล็อกอินบัญชี Cloudflare (ทำครั้งแรกเพียงครั้งเดียว):
   ```bash
   npx wrangler login
   ```
2. สั่ง Deploy ขึ้น Cloudflare Pages:
   ```bash
   npm run pages:deploy
   ```
   *(หรือใช้คำสั่ง: `npx wrangler pages deploy public`)*
3. เลือกสร้างโปรเจกต์ใหม่และตั้งชื่อโปรเจกต์ เช่น `samwa-waterwatch`
4. เมื่ออัปโหลดเสร็จ จะได้รับ URL ประจำโปรเจกต์ (เช่น `https://samwa-waterwatch.pages.dev`) ใช้งานได้ทันที

---

### 🧪 การทดสอบ Cloudflare Pages บนเครื่อง Local
จำลองสภาพแวดล้อม Cloudflare Pages Functions เสมือนจริงบนเครื่องของคุณ:

```bash
npm run pages:dev
```
- ระบบจะเปิดรันบน `http://localhost:8788` โดยจำลองทั้ง Static Files ใน `public/` และ Edge Functions ใน `functions/`

---

## 💻 การรันแบบดั้งเดิม (Node.js Express & Docker)

หากต้องการรันเซิร์ฟเวอร์ Node.js Express แบบ Standalone บน Localhost หรือ VPS ส่วนตัว:

### รันผ่าน Node.js
```bash
# ติดตั้ง dependencies
npm install

# เริ่มต้นเซิร์ฟเวอร์ Express (Port 3000)
npm start
```
เปิดบราวเซอร์ที่: `http://localhost:3000`

### รันผ่าน Docker & Docker Compose
```bash
# เริ่มต้นคอนเทนเนอร์ในโหมด Background
docker compose up -d

# ดูสถานะและ Log
docker compose ps
docker compose logs -f

# หยุดการทำงาน
docker compose down
```

---

## 📂 โครงสร้างโฟลเดอร์โปรเจกต์ (Project Structure)

```
Flood Emergency/
├── functions/                     # Cloudflare Pages Functions (Full-Stack Edge)
│   ├── api/
│   │   ├── water-summary.js       # Core API: Scraper 9 สถานี + Dual Gate ID 21 + Edge Caching
│   │   ├── refresh.js             # API Manual Refresh Trigger
│   │   └── realtime.js            # Telemetry Endpoint
│   └── package.json               # Type module สำหรับ Edge Functions
├── public/                        # Static Frontend Assets (Cloudflare Pages Output)
│   ├── index.html                 # หน้า Dashboard โมเดิร์น Responsive Glassmorphism
│   ├── favicon.png                # ไอคอน Favicon
│   ├── logo.png                   # โลโก้แอปพลิเคชัน
│   ├── css/
│   │   └── style.css              # แอนิเมชันระดับน้ำ, คลื่นผิวน้ำ, เรดาร์พัลส์
│   └── js/
│       └── app.js                 # Frontend Controller (Fetch /api/water-summary, Leaflet Map)
├── scrapers/                      # Scraper โมดูลสำหรับ Express Node.js
│   ├── thaiwater.js
│   └── bkkwater.js
├── server.js                      # Express Server สำหรับ Local & VPS Docker
├── wrangler.toml                  # Cloudflare Pages Configuration
├── stationsConfig.js              # พิกัดและเกณฑ์ 9 สถานี
├── Dockerfile                     # Docker Image สำหรับ Express
├── docker-compose.yml             # Docker Compose
└── package.json                   # Scripts: pages:dev, pages:deploy, start
```

---

## 🎨 จุดเด่นด้าน UX/UI และการเตือนภัย (Visual System)

1. **Animated Water Gauge & Subtle Waves:**
   - เกจจำลองระดับน้ำในลำคลองปรับระดับสูง-ต่ำแบบนุ่มนวล (`cubic-bezier(0.4, 0, 0.2, 1)`)
   - มีระลอกคลื่นน้ำผิวน้ำกระเพื่อมตลอดเวลา (Subtle CSS Wave Motion)
2. **Dual Column Gate Card (สำหรับ ปตร. คลองสามวา ID 21):**
   - แบ่ง 2 ฝั่ง ซ้าย (ด้านใน) - ขวา (ด้านนอก) กั้นด้วยสัญลักษณ์เสาบานประตูระบายน้ำ
   - แสดงตัวเลขระดับน้ำ เกณฑ์วิกฤติ และเกณฑ์ตลิ่งแยกกันอิสระ
   - แสดงผลต่างระดับน้ำ (Diff In/Out) และระยะเปิดบานประตูน้ำ
3. **Radar Ping & Status Pulse บนแผนที่ Leaflet:**
   - สถานีวิกฤติ (🟠) และล้นตลิ่ง (🔴) มีวงแหวนคลื่นเรดาร์กะพริบกระจายออกจากตัวหมุดเป็นจังหวะ
   - จุด GPS ตำแหน่งผู้ใช้มีวงแสงสะท้อนเรดาร์แผ่ขยายเบาๆ รอบพิกัด
4. **100% Visual Alerts (ไม่มีเสียงรบกวน):**
   - เตือนภัยด้วยแสง สี และแบนเนอร์ชัดเจน ไม่ต้องขอสิทธิ์ Audio บนมือถือ ไม่เปลืองแบตเตอรี่ และปลอดภัยต่อการเปิดหน้าจอทิ้งไว้ตลอดเวลา

---

## 📄 License
ISC License
