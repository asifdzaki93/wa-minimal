# WA Gateway API

Sistem WhatsApp Gateway minimal berbasis Node.js + Express + Baileys

## 🚀 Fitur Utama
- Kirim pesan teks & media ke WhatsApp via REST API
- Auto-reply berbasis trigger JSON
- Scan QR code untuk login WhatsApp Web
- Halaman testing API siap pakai (`/test.html`)
- Siap deploy di Replit/Render/Cloud

## 🛠️ Cara Deploy di Replit

[![Deploy on Replit](https://replit.com/badge/github/asifdzaki93/wa-minimal)](https://replit.com/import/github/asifdzaki93/wa-minimal)


1. **Klik tombol "Run" di Replit**
2. Tunggu instalasi selesai, server otomatis berjalan
3. Buka tab web, akses `/` (otomatis redirect ke `/test.html`)
4. Scan QR WhatsApp untuk login

## 📦 Cara Jalankan Lokal
```bash
npm install
npm start
```
Akses: [http://localhost:3000](http://localhost:3000)

## 🔑 Struktur API
- **GET /status** — Cek status koneksi WhatsApp
- **GET /qr** — Ambil QR code login
- **POST /send-text** — Kirim pesan teks
- **POST /send-media** — Kirim media (gambar, video, dokumen, audio)
- **GET /logout** — Logout WhatsApp

## 🆕 Fitur Tambahan
- **Jadwal Pengiriman Pesan:**
  - Endpoint: `POST /schedule-message` (jadwalkan pesan ke nomor tertentu pada waktu tertentu)
- **Cek Daftar Kontak:**
  - Endpoint: `GET /contacts` (ambil semua kontak WhatsApp)
- **Cek Daftar Grup:**
  - Endpoint: `GET /groups` (ambil semua grup WhatsApp)
- **Ambil Kontak di Dalam Grup:**
  - Endpoint: `GET /group-members?jid=JID_GRUP` (ambil anggota grup berdasarkan JID)
- **Upload Media Langsung:**
  - Endpoint: `POST /send-upload` (upload file langsung dari form, bukan hanya dari URL)
- **Export Kontak, Grup, dan Member Grup:**
  - `GET /export/contacts` — Download semua kontak (JSON)
  - `GET /export/groups` — Download semua grup (JSON)
  - `GET /export/group-members?jid=JID_GRUP` — Download anggota grup tertentu (JSON)

Semua fitur ini bisa diuji langsung dari halaman `/test.html`.

## 🧑‍💻 Halaman Testing
Akses `/test.html` untuk UI testing API (kirim pesan, media, cek status, scan QR, logout)

## ⚠️ Catatan Penting
- Folder `auth_info` otomatis di-ignore dari repo (jangan upload session ke publik)
- Untuk auto-reply, edit file `public/autoreply.json`
- Nomor WhatsApp harus format internasional (cth: 6281234567890)

## 👨‍💻 Kontribusi
Pull request & issue sangat diterima!

## 📨 Contoh: Schedule Bulk Message & Monitoring

### 1. Kirim Bulk Message Terjadwal (Pesan Unik per Kontak)
Misal, Anda ingin broadcast ke banyak kontak dengan isi pesan berbeda agar tidak terdeteksi spam:

```js
// Contoh di sisi client (Node.js, bisa juga pakai Postman/JS di browser)
const contacts = [
  { number: '6281234567890', name: 'Budi' },
  { number: '6289876543210', name: 'Siti' },
  // ...daftar kontak lain
];
const now = new Date();
contacts.forEach((c, i) => {
  const sendTime = new Date(now.getTime() + (i * 60000)); // jeda 1 menit per kontak
  const message = `Halo ${c.name}, ini pesan khusus untuk Anda!\nWaktu kirim: ${sendTime.toLocaleString()}`;
  fetch('/schedule-message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      number: c.number,
      message,
      time: sendTime.toISOString()
    })
  });
});
```
- Pesan otomatis unik: ada nama kontak & waktu kirim.
- Jeda antar pesan bisa diatur (misal 1 menit) agar lebih aman.

### 2. Monitoring Status Pesan Terjadwal
Saat ini, status pesan terjadwal hanya bisa dimonitor manual (karena sistem menyimpan di memori):
- Lihat log server untuk pesan yang sudah dikirim.
- Untuk monitoring lebih lanjut, bisa tambahkan endpoint `/scheduled-messages` untuk melihat antrian pesan (bisa dikembangkan).

### 3. (Opsional) Menambah Monitoring Antrian
Tambahkan endpoint berikut di backend:
```js
app.get('/scheduled-messages', (req, res) => {
  res.json(scheduledMessages);
});
```
Lalu akses `/scheduled-messages` untuk melihat antrian pesan yang belum terkirim.

---

**WA Gateway API — Siap pakai untuk integrasi WhatsApp!**
