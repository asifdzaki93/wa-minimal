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
- **POST /send-media** — Kirim media (gambar, video, dokumen, audio) _dengan cache_
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
- **Profil Kontak (Nama, Foto, Status, Business Profile):**
  - Endpoint: `GET /profile/:number` (ambil profil lengkap kontak)
  - Endpoint: `GET /profile/:number/photo` (ambil foto profil kontak)
  - Endpoint: `GET /profile/:number/status` (ambil status kontak)
  - Endpoint: `POST /profile/:number/update` (update profil kontak dan simpan ke cache)
  - Endpoint: `POST /contacts/refresh-profiles` (refresh profil semua kontak)
- **Bulk Message System (Pengiriman Massal):**
  - Halaman: `/bulk.html` (UI lengkap untuk pengiriman massal)
  - Fitur: Template pesan, batch processing, delay config, error handling
  - Keamanan: Randomisasi delay, error rate monitoring, stop on error
- **Export Kontak, Grup, dan Member Grup:**

  - `GET /export/contacts` — Download semua kontak (JSON)
  - `GET /export/contacts/excel` — Download semua kontak (Excel)
  - `GET /export/groups` — Download semua grup (JSON)
  - `GET /export/groups/excel` — Download semua grup (Excel)
  - `GET /export/group-members?jid=JID_GRUP` — Download anggota grup tertentu (JSON)
  - `GET /export/group-members/excel?jid=JID_GRUP` — Download anggota grup tertentu (Excel)

- **Cache Management:**
  - `GET /cache/media` — Monitor status cache media
  - `POST /cache/cleanup` — Bersihkan cache yang kadaluarsa

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
  { number: "6281234567890", name: "Budi" },
  { number: "6289876543210", name: "Siti" },
  // ...daftar kontak lain
];
const now = new Date();
contacts.forEach((c, i) => {
  const sendTime = new Date(now.getTime() + i * 60000); // jeda 1 menit per kontak
  const message = `Halo ${
    c.name
  }, ini pesan khusus untuk Anda!\nWaktu kirim: ${sendTime.toLocaleString()}`;
  fetch("/schedule-message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      number: c.number,
      message,
      time: sendTime.toISOString(),
    }),
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
app.get("/scheduled-messages", (req, res) => {
  res.json(scheduledMessages);
});
```

Lalu akses `/scheduled-messages` untuk melihat antrian pesan yang belum terkirim.

### 4. Contoh: Ambil Profil Kontak

```js
// Ambil profil lengkap kontak
const profile = await fetch("/profile/6281234567890").then((r) => r.json());
console.log(profile);
// Output:
// {
//   number: "6281234567890",
//   jid: "6281234567890@s.whatsapp.net",
//   name: "Nama Kontak",
//   status: "Status WhatsApp",
//   businessProfile: {
//     name: "Nama Bisnis",
//     description: "Deskripsi bisnis",
//     email: "email@bisnis.com",
//     website: "https://website.com",
//     category: "Kategori bisnis",
//     subcategory: "Sub-kategori"
//   },
//   profilePicture: "https://url-foto-profil.com",
//   lastSeen: 1640995200
// }

// Ambil foto profil (redirect ke URL foto)
window.open("/profile/6281234567890/photo", "_blank");

// Ambil status kontak
const status = await fetch("/profile/6281234567890/status").then((r) =>
  r.json()
);
console.log(status);
// Output:
// {
//   number: "6281234567890",
//   jid: "6281234567890@s.whatsapp.net",
//   status: "Status WhatsApp",
//   lastSeen: 1640995200
// }

// Update profil kontak dan simpan ke cache
const updateResult = await fetch("/profile/6281234567890/update", {
  method: "POST"
}).then((r) => r.json());
console.log(updateResult);
// Output:
// {
//   success: true,
//   message: "Profil berhasil diupdate",
//   contact: {
//     id: "6281234567890@s.whatsapp.net",
//     number: "6281234567890",
//     name: "Nama Kontak",
//     status: "Status WhatsApp",
//     businessProfile: { ... },
//     profilePicture: "https://url-foto.com",
//     lastSeen: 1640995200,
//     updatedAt: "2024-01-01T12:00:00.000Z"
//   }
// }

// Refresh profil semua kontak
const refreshResult = await fetch("/contacts/refresh-profiles", {
  method: "POST"
}).then((r) => r.json());
console.log(refreshResult);
// Output:
// {
//   success: true,
//   message: "Refresh profil selesai",
//   results: {
//     total: 1468,
//     updated: 245,
//     failed: 12,
//     details: [
//       {
//         jid: "6281234567890@s.whatsapp.net",
//         status: "updated",
//         changes: ["name", "status", "profilePicture"]
//       }
//     ]
//   }
// }

### 5. Contoh: Bulk Message System

**Akses UI Bulk Message:**
```

http://localhost:3000/bulk.html

```

**Fitur Utama:**
- **Template Pesan:** Gunakan variabel `{{name}}`, `{{number}}`, `{{time}}`, `{{date}}`, `{{random}}`
- **Sumber Kontak:** Manual input, file upload, daftar kontak, atau grup tertentu
- **Batch Processing:** Kirim dalam batch kecil untuk keamanan
- **Delay Configuration:** Jeda antar pesan dan antar batch
- **Error Handling:** Stop otomatis jika error rate > 10%
- **Progress Monitoring:** Real-time progress dan statistik
- **Export Results:** Download hasil dalam format CSV/JSON

**Konfigurasi Keamanan:**
- Jeda minimal 5 detik antar pesan
- Randomisasi delay ±20% untuk pola natural
- Batch size 5-50 pesan (default: 10)
- Jeda antar batch 10 detik - 10 menit
- Monitoring error rate otomatis

**Contoh Template Pesan:**
```

Halo {{name}}!

Terima kasih telah bergabung dengan kami.
Waktu pengiriman: {{time}}
Tanggal: {{date}}
ID Pesan: {{random}}

Salam,
Tim Support

```

**Workflow Penggunaan:**
1. Buka `/bulk.html`
2. Pastikan WhatsApp terhubung
3. Pilih sumber kontak (manual/file/contacts/group)
4. Load kontak
5. Tulis template pesan dengan variabel
6. Konfigurasi delay dan batch size
7. Set waktu mulai (opsional)
8. Mulai pengiriman massal
9. Monitor progress real-time
10. Export hasil setelah selesai

---

**WA Gateway API — Siap pakai untuk integrasi WhatsApp!**
```
