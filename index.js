import express from "express";
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import fs from "fs";
import fetch from "node-fetch";
import mime from "mime-types";
import path from "path";
import qrcode from "qrcode";
import { fileURLToPath } from "url";
import pino from "pino";
import multer from "multer";

// Fix __dirname untuk ES Module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Logger Pino seperti contoh Baileys
const logger = pino({
  level: 'info', // hanya info, warn, error yang tampil
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});

// Inisialisasi Express
const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname, "public"))); // folder public untuk qr.html dll

// Global state
let sock = null;
let qrData = null;
let isConnected = false;

// Inisialisasi koneksi WA
const initWA = async () => {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");

  sock = makeWASocket({
    version: (await fetchLatestBaileysVersion()).version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger), // logger passed here
    },
    printQRInTerminal: false,
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) qrData = qr;

    if (connection === "open") {
      console.log("✅ Tersambung ke WhatsApp");
      isConnected = true;
      qrData = null;
    }

    if (connection === "close") {
      isConnected = false;
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        console.log("🔁 Reconnecting...");
        await initWA();
      } else {
        console.log("🔒 Logged out");
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  // AUTO REPLY SYSTEM
  sock.ev.on("messages.upsert", async (m) => {
    try {
      if (m.type !== "notify" || !Array.isArray(m.messages)) return;
      const messages = m.messages;
      // Baca database trigger
      const dbPath = path.join(__dirname, "public", "autoreply.json");
      if (!fs.existsSync(dbPath)) return;
      const db = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
      for (const msg of messages) {
        if (!msg.message || msg.key.fromMe) continue;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        for (const rule of db) {
          if (text.toLowerCase().includes(rule.trigger.toLowerCase())) {
            const jid = msg.key.remoteJid;
            await sock.sendMessage(jid, { text: rule.action }, { quoted: msg });
            break;
          }
        }
      }
    } catch (err) {
      console.error("❌ Error auto-reply:", err);
    }
  });
};

await initWA();

// ==============================
// ✅ API ENDPOINTS
// ==============================

// Ambil QR code base64
app.get("/qr", async (req, res) => {
  if (!qrData) return res.status(404).json({ message: "QR belum tersedia atau sudah discan" });
  const qrImage = await qrcode.toDataURL(qrData);
  res.json({ qr: qrImage });
});

// Cek status koneksi
app.get("/status", (req, res) => {
  res.json({ connected: isConnected });
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
    const caption = req.body.caption;
    const jid = number?.replace(/\D/g, "") + "@s.whatsapp.net";
    let buffer, mimeType, fileName, ext;
    // Daftar ekstensi
    const imageExt = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"];
    const videoExt = [".mp4", ".3gp", ".mkv", ".mov", ".avi", ".webm"];
    const audioExt = [".mp3", ".ogg", ".wav", ".m4a", ".aac", ".opus"];

    if (req.file) {
      // Upload file
      buffer = req.file.buffer;
      mimeType = req.file.mimetype;
      fileName = req.file.originalname;
      ext = (fileName || "").split(".").pop()?.toLowerCase() || "";
      ext = "." + ext;
    } else if (req.body.url) {
      // Download dari URL
      const response = await fetch(req.body.url);
      buffer = Buffer.from(await response.arrayBuffer());
      mimeType = response.headers.get("content-type") || mime.lookup(req.body.url) || "";
      fileName = path.basename(req.body.url.split("?")[0]);
      ext = path.extname(fileName).toLowerCase();
    } else {
      return res.status(400).json({ error: "File upload atau url harus diisi" });
    }

    if (!isConnected) {
      await initWA();
      await waitForConnection();
    }
    // Deteksi prioritas: mime-type, lalu ekstensi
    if ((mimeType.startsWith("image/") && ext !== ".svg") || imageExt.includes(ext)) {
      await sock.sendMessage(jid, { image: buffer, mimetype: mimeType, caption });
    } else if (mimeType.startsWith("video/") || videoExt.includes(ext)) {
      await sock.sendMessage(jid, { video: buffer, mimetype: mimeType, caption });
    } else if (mimeType.startsWith("audio/") || audioExt.includes(ext)) {
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

// Logout
app.get("/logout", async (req, res) => {
  try {
    if (!sock) return res.status(400).json({ message: "Tidak ada sesi aktif" });

    await sock.logout();
    sock = null;
    isConnected = false;
    qrData = null;

    const authPath = path.join(__dirname, "auth_info");
    if (fs.existsSync(authPath)) {
      fs.rmSync(authPath, { recursive: true, force: true });
    }

    console.log("🔃 Logout sukses. Inisialisasi ulang...");
    await initWA();

    res.json({ status: "Logout berhasil. Silakan scan QR baru." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Redirect root ke test.html
app.get('/', (req, res) => {
  res.redirect('/test.html');
});

// ==============================
// ▶️ START SERVER
// ==============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 WA Gateway aktif di http://localhost:${PORT}`);
});

const upload = multer({ storage: multer.memoryStorage() });

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

// Ambil daftar kontak
app.get("/contacts", async (req, res) => {
  try {
    if (!isConnected) {
      await initWA();
      await waitForConnection();
    }
    const contacts = Object.values(sock?.store?.contacts || {});
    res.json(contacts);
  } catch (err) {
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
    const groups = Object.values(sock?.store?.chats || {}).filter(c => c.id && c.id.endsWith("@g.us"));
    res.json(groups);
  } catch (err) {
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
    if (!isConnected) {
      await initWA();
      await waitForConnection();
    }
    const contacts = Object.values(sock?.store?.contacts || {});
    res.setHeader('Content-Disposition', 'attachment; filename="contacts.json"');
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(contacts, null, 2));
  } catch (err) {
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
    const groups = Object.values(sock?.store?.chats || {}).filter(c => c.id && c.id.endsWith("@g.us"));
    res.setHeader('Content-Disposition', 'attachment; filename="groups.json"');
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(groups, null, 2));
  } catch (err) {
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
