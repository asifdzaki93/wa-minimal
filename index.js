import express from "express";
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import mime from "mime-types";
import qrcode from "qrcode";
import { fileURLToPath } from "url";
import pino from "pino";
import multer from "multer";
import ExcelJS from "exceljs";

const upload = multer({ storage: multer.memoryStorage() });

// ES module support
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cache untuk hasil fetch media (URL -> {buffer, mimeType, fileName, timestamp})
const mediaCache = new Map();
const CACHE_DURATION = 30 * 60 * 1000; // 30 menit dalam milliseconds

// Helper function untuk cache media
const getCachedMedia = (url) => {
  const cached = mediaCache.get(url);
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    return cached;
  }
  return null;
};

const setCachedMedia = (url, data) => {
  mediaCache.set(url, {
    ...data,
    timestamp: Date.now()
  });
};

// Dummy logger untuk Baileys (menghindari error logger.trace)
const dummyLogger = {
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => dummyLogger
};

// Init express
const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname, "public"))); // folder public untuk qr.html dll

// Global WA state
let sock;
let qrString = null;
let isConnected = false;
let contacts = [];

// File untuk menyimpan kontak
const CONTACT_FILE = './contacts_cache.json';

// Helper function untuk mendapatkan nama kontak yang lebih baik
const getContactName = async (jid) => {
  try {
    if (!sock || !isConnected) return jid.replace('@s.whatsapp.net', '');
    
    // Coba ambil dari berbagai sumber
    const contact = await sock.contacts?.[jid];
    if (contact) {
      return contact.notify || contact.name || contact.short || contact.vname || jid.replace('@s.whatsapp.net', '');
    }
    
    // Coba ambil business profile
    try {
      const businessProfile = await sock.getBusinessProfile(jid);
      if (businessProfile?.name) {
        return businessProfile.name;
      }
    } catch (err) {
      // Business profile tidak tersedia, lanjut ke metode berikutnya
    }
    
    // Coba ambil status
    try {
      const status = await sock.fetchStatus(jid);
      if (status?.status) {
        return status.status;
      }
    } catch (err) {
      // Status tidak tersedia, lanjut ke metode berikutnya
    }
    
    return jid.replace('@s.whatsapp.net', '');
  } catch (err) {
    return jid.replace('@s.whatsapp.net', '');
  }
};

// Helper function untuk menyimpan kontak ke file
const saveContacts = async (contactsData) => {
  try {
    let contactArray = [];
    
    // Jika contactsData adalah array (dari grup), gunakan langsung
    if (Array.isArray(contactsData)) {
      contactArray = contactsData;
    } else {
      // Jika contactsData adalah object (dari sock.contacts), convert ke array
      for (const [jid, contact] of Object.entries(contactsData || {})) {
        const name = await getContactName(jid);
        contactArray.push({
          id: jid,
          name: name,
          status: contact.status || 'Unknown'
        });
      }
    }
    
    fs.writeFileSync(CONTACT_FILE, JSON.stringify(contactArray, null, 2));
    console.log(`📁 Kontak disimpan ke ${CONTACT_FILE} (${contactArray.length} kontak)`);
    return contactArray;
  } catch (err) {
    console.error('❌ Error menyimpan kontak:', err);
    return [];
  }
};

// Helper function untuk memuat kontak dari file
const loadContacts = () => {
  try {
    if (fs.existsSync(CONTACT_FILE)) {
      const data = fs.readFileSync(CONTACT_FILE, 'utf8');
      const contacts = JSON.parse(data);
      if (Array.isArray(contacts)) {
        console.log(`📂 Kontak dimuat dari file: ${contacts.length} kontak`);
        return contacts;
      } else {
        console.log(`📂 Format file kontak tidak valid`);
        return [];
      }
    } else {
      console.log(`📂 File kontak tidak ditemukan: ${CONTACT_FILE}`);
    }
  } catch (err) {
    console.error('❌ Error memuat kontak:', err);
  }
  console.log('📂 Mengembalikan array kontak kosong');
  return [];
};

// Inisialisasi WA Socket
const initWA = async () => {
  const { state, saveCreds } = await useMultiFileAuthState("./auth_info");
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, fs),
    },
    logger: dummyLogger,
    syncFullHistory: true
  });

  // Event QR dan koneksi
  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      qrString = qr;
    }

    if (connection === "open") {
      isConnected = true;
      qrString = null;
      console.log("✅ Connected to WhatsApp");
      
      // Tunggu sebentar lalu simpan kontak awal
      setTimeout(async () => {
        if (sock.contacts) {
          console.log(`🔍 Kontak tersedia setelah koneksi: ${Object.keys(sock.contacts).length} kontak`);
          contacts = await saveContacts(sock.contacts);
          console.log(`📇 Kontak awal dimuat: ${contacts.length} kontak`);
        } else {
          console.log(`⚠️ sock.contacts tidak tersedia setelah koneksi`);
        }
      }, 3000); // Tunggu lebih lama
    } else if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

      console.log("🔌 Disconnected. Reconnect?", shouldReconnect);
      isConnected = false;
      if (shouldReconnect) initWA();
    }
  });

  // Event saat kontak diperbarui
  sock.ev.on("contacts.update", async (updates) => {
    console.log(`🔄 Kontak diperbarui: ${updates.length} entri`);
    if (sock.contacts) {
      contacts = await saveContacts(sock.contacts);
    }
  });

  // Event saat kontak diset (sinkronisasi awal)
  sock.ev.on("contacts.set", async (newContacts) => {
    console.log(`📇 Kontak diset: ${Object.keys(newContacts).length} kontak`);
    contacts = await saveContacts(newContacts);
  });

  sock.ev.on("creds.update", saveCreds);
};

// Jalankan WA
await initWA();

// Muat kontak dari file jika ada
contacts = loadContacts();

// ========== API ROUTES ==========

// Ambil QR code
app.get("/qr", async (req, res) => {
  if (!qrString) return res.status(404).json({ message: "QR belum tersedia atau sudah discan." });

  const qrImage = await qrcode.toDataURL(qrString);
  res.json({ qr: qrImage });
});

// Cek status koneksi
app.get("/status", (req, res) => {
  res.json({ connected: isConnected });
});

// Logout WhatsApp
app.get("/logout", async (req, res) => {
  try {
    if (sock) {
      await sock.logout();
      isConnected = false;
      contacts = [];
      // Hapus file kontak cache
      if (fs.existsSync(CONTACT_FILE)) {
        fs.unlinkSync(CONTACT_FILE);
        console.log("🗑️ File kontak cache dihapus");
      }
      console.log("🔌 Logout berhasil");
    }
    res.json({ status: "Logout berhasil" });
  } catch (err) {
    console.error("❌ Error logout:", err);
    res.status(500).json({ error: err.message });
  }
});

// Helper: tunggu sampai koneksi aktif
async function waitForConnection(timeoutMs = 15000) {
  const interval = 500;
  let waited = 0;
  while (!isConnected && waited < timeoutMs) {
    await new Promise(r => setTimeout(r, interval));
    waited += interval;
  }
  return isConnected;
}

// Kirim pesan teks
app.post("/send-text", async (req, res) => {
  const { number, message } = req.body;
  const jid = number?.replace(/\D/g, "") + "@s.whatsapp.net";

  try {
    if (!isConnected) {
      await initWA();
      const ok = await waitForConnection();
      if (!ok) return res.status(503).json({ error: "WhatsApp belum terhubung, coba lagi nanti." });
    }
    await sock.sendMessage(jid, { text: message });
    res.json({ status: "Pesan berhasil dikirim" });
  } catch (err) {
    console.error("❌ Error kirim teks:", err);
    res.status(500).json({ error: err.message });
  }
});

// Kirim media dari URL
app.post("/send-media", upload.single("file"), async (req, res) => {
  try {
    const number = req.body.number;
    const url = req.body.url;
    const caption = req.body.caption;
    const file = req.file;
    const jid = number?.replace(/\D/g, "") + "@s.whatsapp.net";

    if (!isConnected) {
      await initWA();
      await waitForConnection();
    }

    let buffer, mimeType, fileName;

    if (file) {
      // Upload file langsung
      buffer = file.buffer;
      mimeType = file.mimetype;
      fileName = file.originalname;
    } else if (url) {
      // Cek cache dulu
      const cached = getCachedMedia(url);
      if (cached) {
        console.log("📦 Menggunakan cache media");
        buffer = cached.buffer;
        mimeType = cached.mimeType;
        fileName = cached.fileName;
      } else {
        // Download dari URL
        console.log("🌐 Download media dari URL");
        const response = await fetch(url);
        buffer = Buffer.from(await response.arrayBuffer());
        mimeType = response.headers.get("content-type") || mime.lookup(url);
        fileName = path.basename(url);

        // Simpan ke cache
        setCachedMedia(url, { buffer, mimeType, fileName });
      }
    } else {
      return res.status(400).json({ error: "URL atau file diperlukan" });
    }

    // Tentukan tipe media berdasarkan mime type
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    const imageExt = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];
    const videoExt = ["mp4", "3gp", "mkv", "mov", "avi", "webm"];
    const audioExt = ["mp3", "ogg", "wav", "m4a", "aac", "opus"];

    if (imageExt.includes(ext) || mimeType.startsWith("image/")) {
      await sock.sendMessage(jid, { image: buffer, mimetype: mimeType, caption });
    } else if (videoExt.includes(ext) || mimeType.startsWith("video/")) {
      await sock.sendMessage(jid, { video: buffer, mimetype: mimeType, caption });
    } else if (audioExt.includes(ext) || mimeType.startsWith("audio/")) {
      await sock.sendMessage(jid, { audio: buffer, mimetype: mimeType, caption });
    } else {
      await sock.sendMessage(jid, { document: buffer, mimetype: mimeType, fileName, caption });
    }

    res.json({ status: "Media berhasil dikirim" });
  } catch (err) {
    console.error("❌ Error kirim media:", err);
    res.status(500).json({ error: err.message });
  }
});

// ==============================
// ▶️ START SERVER
// ==============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 WA Gateway aktif di http://localhost:${PORT}`);
});

// Jadwal pengiriman pesan sederhana (in-memory, non-persisten)
let scheduledMessages = [];
setInterval(async () => {
  const now = Date.now();
  const toSend = scheduledMessages.filter(msg => msg.time <= now);
  scheduledMessages = scheduledMessages.filter(msg => msg.time > now);
  for (const msg of toSend) {
    try {
      if (!isConnected) {
        await initWA();
        await waitForConnection();
      }
      await sock.sendMessage(msg.jid, { text: msg.message });
    } catch (e) {
      console.error("Gagal kirim pesan terjadwal:", e);
    }
  }
}, 5000);

// Auto-cleanup cache media setiap 10 menit
setInterval(() => {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [url, data] of mediaCache.entries()) {
    if ((now - data.timestamp) >= CACHE_DURATION) {
      mediaCache.delete(url);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 Auto-cleanup: ${cleanedCount} item cache dibersihkan`);
  }
}, 10 * 60 * 1000); // 10 menit

app.post("/schedule-message", async (req, res) => {
  const { number, message, time } = req.body;
  const jid = number?.replace(/\D/g, "") + "@s.whatsapp.net";
  const sendTime = new Date(time).getTime();
  if (!jid || !message || isNaN(sendTime)) return res.status(400).json({ error: "Data tidak valid" });
  scheduledMessages.push({ jid, message, time: sendTime });
  res.json({ status: "Pesan dijadwalkan", sendAt: new Date(sendTime).toISOString() });
});

// Monitoring antrian pesan terjadwal
app.get('/scheduled-messages', (req, res) => {
  res.json(scheduledMessages);
});

// Monitoring cache media
app.get('/cache/media', (req, res) => {
  const now = Date.now();
  const cacheInfo = {
    totalItems: mediaCache.size,
    cacheDuration: CACHE_DURATION / 1000 / 60, // dalam menit
    items: []
  };
  
  for (const [url, data] of mediaCache.entries()) {
    const age = now - data.timestamp;
    const isExpired = age >= CACHE_DURATION;
    
    cacheInfo.items.push({
      url: url.substring(0, 100) + (url.length > 100 ? '...' : ''),
      fileName: data.fileName,
      mimeType: data.mimeType,
      size: data.buffer.length,
      age: Math.round(age / 1000), // dalam detik
      isExpired
    });
  }
  
  res.json(cacheInfo);
});

// Bersihkan cache yang kadaluarsa
app.post('/cache/cleanup', (req, res) => {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [url, data] of mediaCache.entries()) {
    if ((now - data.timestamp) >= CACHE_DURATION) {
      mediaCache.delete(url);
      cleanedCount++;
    }
  }
  
  res.json({ 
    message: `Cache dibersihkan`, 
    cleanedItems: cleanedCount,
    remainingItems: mediaCache.size 
  });
});

// Ambil semua kontak
app.get("/contacts", async (req, res) => {
  try {
    // Coba ambil dari memory dulu
    if (contacts.length > 0) {
      return res.json(contacts);
    }
    
    // Jika kosong, coba ambil dari sock.contacts
    if (isConnected && sock.contacts) {
      contacts = saveContacts(sock.contacts);
      return res.json(contacts);
    }
    
    // Jika masih kosong, coba muat dari file
    contacts = loadContacts();
    if (contacts.length > 0) {
      return res.json(contacts);
    }
    
    // Jika semua kosong, kembalikan array kosong
    res.json([]);
  } catch (err) {
    console.error("[ERROR] /contacts:", err);
    res.status(500).json({ error: err.message });
  }
});

// Refresh kontak (memaksa ambil ulang)
app.post("/contacts/refresh", async (req, res) => {
  try {
    if (!isConnected) {
      return res.status(503).json({ error: "WhatsApp belum terhubung" });
    }
    
    console.log(`🔍 Mencoba refresh kontak...`);
    
    // Coba ambil kontak dengan cara yang lebih sederhana
    try {
      // Ambil semua grup
      const groupsObj = await sock.groupFetchAllParticipating();
      console.log(`📋 Ditemukan ${Object.keys(groupsObj || {}).length} grup`);
      
      const allParticipants = [];
      
      // Ambil peserta dari setiap grup
      for (const [groupId, group] of Object.entries(groupsObj || {})) {
        try {
          console.log(`🔍 Mengambil peserta dari grup: ${group.subject || groupId}`);
          const metadata = await sock.groupMetadata(groupId);
          if (metadata.participants && Array.isArray(metadata.participants)) {
            console.log(`👥 Grup ${group.subject || groupId}: ${metadata.participants.length} peserta`);
            allParticipants.push(...metadata.participants);
          }
        } catch (err) {
          console.log(`⚠️ Gagal ambil metadata grup ${groupId}:`, err.message);
        }
      }
      
      console.log(`📊 Total peserta dari semua grup: ${allParticipants.length}`);
      
      // Buat kontak unik dari peserta
      const uniqueContacts = [];
      const seenIds = new Set();
      
      for (const participant of allParticipants) {
        if (participant.id && !seenIds.has(participant.id)) {
          seenIds.add(participant.id);
          const phoneNumber = participant.id.replace('@s.whatsapp.net', '');
          uniqueContacts.push({
            id: participant.id,
            name: phoneNumber,
            status: 'From Group'
          });
        }
      }
      
      console.log(`🔍 Sample kontak yang ditemukan:`, uniqueContacts.slice(0, 5));
      console.log(`📱 Total kontak unik: ${uniqueContacts.length}`);
      
      if (uniqueContacts.length > 0) {
        contacts = uniqueContacts;
        await saveContacts(uniqueContacts);
        
        console.log(`🔄 Kontak di-refresh dari grup: ${contacts.length} kontak`);
        res.json({ 
          status: "Kontak berhasil di-refresh dari grup", 
          count: contacts.length,
          contacts: contacts.slice(0, 10) // Kirim sample 10 kontak saja
        });
      } else {
        res.json({ 
          status: "Tidak ada kontak tersedia", 
          count: 0,
          contacts: [] 
        });
      }
    } catch (err) {
      console.error("❌ Error ambil kontak dari grup:", err);
      res.json({ 
        status: "Tidak ada kontak tersedia", 
        count: 0,
        contacts: [] 
      });
    }
  } catch (err) {
    console.error("[ERROR] /contacts/refresh:", err);
    res.status(500).json({ error: err.message });
  }
});

// Ambil daftar grup
app.get("/groups", async (req, res) => {
  try {
    if (!isConnected) {
      await initWA();
      await waitForConnection();
    }
    // Baileys v6.x: fetch grup dengan API
    const groupsObj = await sock.groupFetchAllParticipating();
    const groups = Object.values(groupsObj || {});
    res.json(groups);
  } catch (err) {
    console.error("[ERROR] /groups:", err);
    res.status(500).json({ error: err.message });
  }
});

// Ambil anggota grup
app.get("/group-members", async (req, res) => {
  const { jid } = req.query;
  try {
    if (!isConnected) {
      await initWA();
      await waitForConnection();
    }
    const metadata = await sock.groupMetadata(jid);
    res.json(metadata.participants);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload media langsung
app.post("/send-upload", upload.single("file"), async (req, res) => {
  const { number, caption } = req.body;
  const file = req.file;
  const jid = number?.replace(/\D/g, "") + "@s.whatsapp.net";
  if (!file) return res.status(400).json({ error: "File tidak ditemukan" });
  const ext = (file.originalname || "").split(".").pop()?.toLowerCase() || "";
  const imageExt = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];
  const videoExt = ["mp4", "3gp", "mkv", "mov", "avi", "webm"];
  const audioExt = ["mp3", "ogg", "wav", "m4a", "aac", "opus"];
  try {
    if (!isConnected) {
      await initWA();
      await waitForConnection();
    }
    if (imageExt.includes(ext)) {
      await sock.sendMessage(jid, { image: file.buffer, mimetype: file.mimetype, caption });
    } else if (videoExt.includes(ext)) {
      await sock.sendMessage(jid, { video: file.buffer, mimetype: file.mimetype, caption });
    } else if (audioExt.includes(ext)) {
      await sock.sendMessage(jid, { audio: file.buffer, mimetype: file.mimetype, caption });
    } else {
      await sock.sendMessage(jid, { document: file.buffer, mimetype: file.mimetype, fileName: file.originalname, caption });
    }
    res.json({ status: "Media berhasil dikirim" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export kontak
app.get('/export/contacts', async (req, res) => {
  try {
    res.setHeader('Content-Disposition', 'attachment; filename="contacts.json"');
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(contacts, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export kontak ke Excel
app.get('/export/contacts/excel', async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Contacts');
    
    // Header
    worksheet.columns = [
      { header: 'Nama', key: 'name', width: 30 },
      { header: 'Nomor', key: 'number', width: 20 },
      { header: 'JID', key: 'id', width: 40 },
      { header: 'Status', key: 'status', width: 15 }
    ];
    
    // Data
    contacts.forEach(contact => {
      worksheet.addRow({
        name: contact.name || contact.notify || 'Unknown',
        number: contact.id?.replace('@s.whatsapp.net', '') || '',
        id: contact.id || '',
        status: contact.status || 'Unknown'
      });
    });
    
    // Styling header
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
    
    res.setHeader('Content-Disposition', 'attachment; filename="contacts.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("[ERROR] /export/contacts/excel:", err);
    res.status(500).json({ error: err.message });
  }
});

// Export grup
app.get('/export/groups', async (req, res) => {
  try {
    if (!isConnected) {
      await initWA();
      await waitForConnection();
    }
    const groupsObj = await sock.groupFetchAllParticipating();
    const groups = Object.values(groupsObj || {});
    res.setHeader('Content-Disposition', 'attachment; filename="groups.json"');
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(groups, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export grup ke Excel
app.get('/export/groups/excel', async (req, res) => {
  try {
    if (!isConnected) {
      await initWA();
      await waitForConnection();
    }
    
    const groupsObj = await sock.groupFetchAllParticipating();
    const groups = Object.values(groupsObj || {});
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Groups');
    
    // Header
    worksheet.columns = [
      { header: 'Nama Grup', key: 'name', width: 40 },
      { header: 'JID Grup', key: 'id', width: 50 },
      { header: 'Jumlah Member', key: 'memberCount', width: 15 },
      { header: 'Deskripsi', key: 'desc', width: 50 },
      { header: 'Pemilik', key: 'owner', width: 30 }
    ];
    
    // Data
    for (const group of groups) {
      try {
        const metadata = await sock.groupMetadata(group.id);
        worksheet.addRow({
          name: metadata.subject || 'Unknown',
          id: group.id || '',
          memberCount: metadata.participants?.length || 0,
          desc: metadata.desc || '',
          owner: metadata.owner || ''
        });
      } catch (err) {
        // Jika gagal ambil metadata, gunakan data dasar
        worksheet.addRow({
          name: 'Unknown',
          id: group.id || '',
          memberCount: 0,
          desc: '',
          owner: ''
        });
      }
    }
    
    // Styling header
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
    
    res.setHeader('Content-Disposition', 'attachment; filename="groups.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("[ERROR] /export/groups/excel:", err);
    res.status(500).json({ error: err.message });
  }
});

// Export member grup
app.get('/export/group-members', async (req, res) => {
  const { jid } = req.query;
  try {
    if (!isConnected) {
      await initWA();
      await waitForConnection();
    }
    const metadata = await sock.groupMetadata(jid);
    res.setHeader('Content-Disposition', `attachment; filename="group-members-${jid}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(metadata.participants, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ambil profil kontak (nama, foto, status, dll)
app.get('/profile/:number', async (req, res) => {
  const { number } = req.params;
  try {
    if (!isConnected) {
      await initWA();
      await waitForConnection();
    }
    
    // Format nomor ke JID
    const jid = number.replace(/\D/g, "") + "@s.whatsapp.net";
    
    console.log(`🔍 Mengambil profil untuk: ${jid}`);
    
    const profile = {
      number: number.replace(/\D/g, ""),
      jid: jid,
      name: null,
      status: null,
      businessProfile: null,
      profilePicture: null,
      lastSeen: null
    };
    
    // 1. Coba ambil dari contacts cache
    const cachedContact = contacts.find(c => c.id === jid);
    if (cachedContact) {
      profile.name = cachedContact.name;
      profile.status = cachedContact.status;
    }
    
    // 2. Coba ambil business profile
    try {
      const businessProfile = await sock.getBusinessProfile(jid);
      if (businessProfile) {
        profile.businessProfile = {
          name: businessProfile.name,
          description: businessProfile.description,
          email: businessProfile.email,
          website: businessProfile.website,
          category: businessProfile.category,
          subcategory: businessProfile.subcategory
        };
        if (businessProfile.name && !profile.name) {
          profile.name = businessProfile.name;
        }
      }
    } catch (err) {
      console.log(`⚠️ Business profile tidak tersedia untuk ${jid}:`, err.message);
    }
    
    // 3. Coba ambil status
    try {
      const status = await sock.fetchStatus(jid);
      if (status) {
        profile.status = status.status;
        profile.lastSeen = status.lastSeen;
      }
    } catch (err) {
      console.log(`⚠️ Status tidak tersedia untuk ${jid}:`, err.message);
    }
    
    // 4. Coba ambil foto profil
    try {
      const ppUrl = await sock.profilePictureUrl(jid, 'image');
      if (ppUrl) {
        profile.profilePicture = ppUrl;
      }
    } catch (err) {
      console.log(`⚠️ Foto profil tidak tersedia untuk ${jid}:`, err.message);
    }
    
    // 5. Coba ambil dari sock.contacts jika tersedia
    if (sock.contacts && sock.contacts[jid]) {
      const contact = sock.contacts[jid];
      if (!profile.name) {
        profile.name = contact.notify || contact.name || contact.short || contact.vname;
      }
    }
    
    console.log(`✅ Profil berhasil diambil untuk ${jid}`);
    res.json(profile);
    
  } catch (err) {
    console.error("[ERROR] /profile/:number:", err);
    res.status(500).json({ error: err.message });
  }
});

// Ambil foto profil kontak
app.get('/profile/:number/photo', async (req, res) => {
  const { number } = req.params;
  try {
    if (!isConnected) {
      await initWA();
      await waitForConnection();
    }
    
    const jid = number.replace(/\D/g, "") + "@s.whatsapp.net";
    
    console.log(`📸 Mengambil foto profil untuk: ${jid}`);
    
    const ppUrl = await sock.profilePictureUrl(jid, 'image');
    if (ppUrl) {
      // Redirect ke URL foto profil
      res.redirect(ppUrl);
    } else {
      res.status(404).json({ error: "Foto profil tidak tersedia" });
    }
    
  } catch (err) {
    console.error("[ERROR] /profile/:number/photo:", err);
    res.status(500).json({ error: err.message });
  }
});

// Ambil status kontak
app.get('/profile/:number/status', async (req, res) => {
  const { number } = req.params;
  try {
    if (!isConnected) {
      await initWA();
      await waitForConnection();
    }
    
    const jid = number.replace(/\D/g, "") + "@s.whatsapp.net";
    
    console.log(`📝 Mengambil status untuk: ${jid}`);
    
    const status = await sock.fetchStatus(jid);
    if (status) {
      res.json({
        number: number.replace(/\D/g, ""),
        jid: jid,
        status: status.status,
        lastSeen: status.lastSeen
      });
    } else {
      res.status(404).json({ error: "Status tidak tersedia" });
    }
    
  } catch (err) {
    console.error("[ERROR] /profile/:number/status:", err);
    res.status(500).json({ error: err.message });
  }
});

// Update profil kontak dan simpan ke cache
app.post('/profile/:number/update', async (req, res) => {
  const { number } = req.params;
  try {
    if (!isConnected) {
      await initWA();
      await waitForConnection();
    }
    
    const jid = number.replace(/\D/g, "") + "@s.whatsapp.net";
    
    console.log(`🔄 Update profil untuk: ${jid}`);
    
    const updatedContact = {
      id: jid,
      number: number.replace(/\D/g, ""),
      name: null,
      status: null,
      businessProfile: null,
      profilePicture: null,
      lastSeen: null,
      updatedAt: new Date().toISOString()
    };
    
    // 1. Coba ambil business profile
    try {
      const businessProfile = await sock.getBusinessProfile(jid);
      if (businessProfile) {
        updatedContact.businessProfile = {
          name: businessProfile.name,
          description: businessProfile.description,
          email: businessProfile.email,
          website: businessProfile.website,
          category: businessProfile.category,
          subcategory: businessProfile.subcategory
        };
        if (businessProfile.name) {
          updatedContact.name = businessProfile.name;
        }
      }
    } catch (err) {
      console.log(`⚠️ Business profile tidak tersedia untuk ${jid}:`, err.message);
    }
    
    // 2. Coba ambil status
    try {
      const status = await sock.fetchStatus(jid);
      if (status) {
        updatedContact.status = status.status;
        updatedContact.lastSeen = status.lastSeen;
      }
    } catch (err) {
      console.log(`⚠️ Status tidak tersedia untuk ${jid}:`, err.message);
    }
    
    // 3. Coba ambil foto profil
    try {
      const ppUrl = await sock.profilePictureUrl(jid, 'image');
      if (ppUrl) {
        updatedContact.profilePicture = ppUrl;
      }
    } catch (err) {
      console.log(`⚠️ Foto profil tidak tersedia untuk ${jid}:`, err.message);
    }
    
    // 4. Coba ambil dari sock.contacts jika tersedia
    if (sock.contacts && sock.contacts[jid]) {
      const contact = sock.contacts[jid];
      if (!updatedContact.name) {
        updatedContact.name = contact.notify || contact.name || contact.short || contact.vname;
      }
    }
    
    // 5. Update atau tambah ke contacts array
    const existingIndex = contacts.findIndex(c => c.id === jid);
    if (existingIndex >= 0) {
      // Update existing contact
      contacts[existingIndex] = { ...contacts[existingIndex], ...updatedContact };
      console.log(`✅ Kontak diperbarui: ${jid}`);
    } else {
      // Add new contact
      contacts.push(updatedContact);
      console.log(`✅ Kontak baru ditambahkan: ${jid}`);
    }
    
    // 6. Simpan ke file cache
    await saveContacts();
    
    console.log(`✅ Profil berhasil diupdate dan disimpan untuk ${jid}`);
    res.json({
      success: true,
      message: "Profil berhasil diupdate",
      contact: updatedContact
    });
    
  } catch (err) {
    console.error("[ERROR] /profile/:number/update:", err);
    res.status(500).json({ error: err.message });
  }
});

// Refresh semua kontak dengan informasi profil terbaru
app.post('/contacts/refresh-profiles', async (req, res) => {
  try {
    if (!isConnected) {
      await initWA();
      await waitForConnection();
    }
    
    console.log(`🔄 Memulai refresh profil untuk ${contacts.length} kontak...`);
    
    const results = {
      total: contacts.length,
      updated: 0,
      failed: 0,
      details: []
    };
    
    // Process contacts in batches to avoid overwhelming the API
    const batchSize = 5;
    for (let i = 0; i < contacts.length; i += batchSize) {
      const batch = contacts.slice(i, i + batchSize);
      
      console.log(`📦 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(contacts.length/batchSize)}`);
      
      const batchPromises = batch.map(async (contact) => {
        try {
          const jid = contact.id;
          const updatedContact = { ...contact };
          let hasChanges = false;
          
          // Update business profile
          try {
            const businessProfile = await sock.getBusinessProfile(jid);
            if (businessProfile) {
              updatedContact.businessProfile = {
                name: businessProfile.name,
                description: businessProfile.description,
                email: businessProfile.email,
                website: businessProfile.website,
                category: businessProfile.category,
                subcategory: businessProfile.subcategory
              };
              if (businessProfile.name && businessProfile.name !== contact.name) {
                updatedContact.name = businessProfile.name;
                hasChanges = true;
              }
            }
          } catch (err) {
            // Business profile not available
          }
          
          // Update status
          try {
            const status = await sock.fetchStatus(jid);
            if (status) {
              updatedContact.status = status.status;
              updatedContact.lastSeen = status.lastSeen;
              hasChanges = true;
            }
          } catch (err) {
            // Status not available
          }
          
          // Update profile picture
          try {
            const ppUrl = await sock.profilePictureUrl(jid, 'image');
            if (ppUrl && ppUrl !== contact.profilePicture) {
              updatedContact.profilePicture = ppUrl;
              hasChanges = true;
            }
          } catch (err) {
            // Profile picture not available
          }
          
          // Update timestamp
          updatedContact.updatedAt = new Date().toISOString();
          
          if (hasChanges) {
            const index = contacts.findIndex(c => c.id === jid);
            if (index >= 0) {
              contacts[index] = updatedContact;
              results.updated++;
              results.details.push({
                jid: jid,
                status: 'updated',
                changes: Object.keys(updatedContact).filter(key => 
                  updatedContact[key] !== contact[key] && key !== 'updatedAt'
                )
              });
            }
          }
          
          return { success: true, jid: jid };
          
        } catch (err) {
          results.failed++;
          results.details.push({
            jid: contact.id,
            status: 'failed',
            error: err.message
          });
          return { success: false, jid: contact.id, error: err.message };
        }
      });
      
      // Wait for batch to complete
      await Promise.all(batchPromises);
      
      // Small delay between batches to avoid rate limiting
      if (i + batchSize < contacts.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Save updated contacts to cache
    await saveContacts();
    
    console.log(`✅ Refresh profil selesai: ${results.updated} updated, ${results.failed} failed`);
    res.json({
      success: true,
      message: `Refresh profil selesai`,
      results: results
    });
    
  } catch (err) {
    console.error("[ERROR] /contacts/refresh-profiles:", err);
    res.status(500).json({ error: err.message });
  }
});

// Export member grup ke Excel
app.get('/export/group-members/excel', async (req, res) => {
  const { jid } = req.query;
  try {
    if (!isConnected) {
      await initWA();
      await waitForConnection();
    }
    
    const metadata = await sock.groupMetadata(jid);
    const participants = metadata.participants || [];
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Group Members');
    
    // Header
    worksheet.columns = [
      { header: 'Nama', key: 'name', width: 30 },
      { header: 'JID', key: 'id', width: 40 },
      { header: 'Role', key: 'role', width: 15 },
      { header: 'Admin', key: 'admin', width: 10 },
      { header: 'Super Admin', key: 'superAdmin', width: 15 }
    ];
    
    // Data
    for (const participant of participants) {
      try {
        // Ambil info kontak dari contacts array
        const contact = contacts.find(c => c.id === participant.id);
        const contactName = contact?.name || contact?.notify || 'Unknown';
        
        worksheet.addRow({
          name: contactName,
          id: participant.id || '',
          role: participant.role || 'member',
          admin: participant.role === 'admin' ? 'Yes' : 'No',
          superAdmin: participant.role === 'superadmin' ? 'Yes' : 'No'
        });
      } catch (err) {
        worksheet.addRow({
          name: 'Unknown',
          id: participant.id || '',
          role: participant.role || 'member',
          admin: participant.role === 'admin' ? 'Yes' : 'No',
          superAdmin: participant.role === 'superadmin' ? 'Yes' : 'No'
        });
      }
    }
    
    // Styling header
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
    
    const groupName = metadata.subject || jid;
    res.setHeader('Content-Disposition', `attachment; filename="group-members-${groupName}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("[ERROR] /export/group-members/excel:", err);
    res.status(500).json({ error: err.message });
  }
}); 