[![Deploy on Replit](https://replit.com/badge/github/asifdzaki93/wa-minimal)](https://replit.com/import/github/asifdzaki93/wa-minimal)

# WA Gateway API

Sistem WhatsApp Gateway minimal berbasis Node.js + Express + Baileys

## 🚀 Fitur Utama
- Kirim pesan teks & media ke WhatsApp via REST API
- Auto-reply berbasis trigger JSON
- Scan QR code untuk login WhatsApp Web
- Halaman testing API siap pakai (`/test.html`)
- Siap deploy di Replit/Render/Cloud

## 🛠️ Cara Deploy di Replit
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

## 🧑‍💻 Halaman Testing
Akses `/test.html` untuk UI testing API (kirim pesan, media, cek status, scan QR, logout)

## ⚠️ Catatan Penting
- Folder `auth_info` otomatis di-ignore dari repo (jangan upload session ke publik)
- Untuk auto-reply, edit file `public/autoreply.json`
- Nomor WhatsApp harus format internasional (cth: 6281234567890)

## 👨‍💻 Kontribusi
Pull request & issue sangat diterima!

---

**WA Gateway API — Siap pakai untuk integrasi WhatsApp!**
