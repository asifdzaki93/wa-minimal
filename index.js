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

// Kirim pesan teks
app.post("/send-text", async (req, res) => {
  const { number, message } = req.body;
  const jid = number?.replace(/\D/g, "") + "@s.whatsapp.net";

  try {
    await sock.sendMessage(jid, { text: message });
    res.json({ status: "Pesan berhasil dikirim" });
  } catch (err) {
    console.error("❌ Error kirim teks:", err);
    res.status(500).json({ error: err.message });
  }
});

// Kirim media dari URL
app.post("/send-media", async (req, res) => {
  const { number, url, caption } = req.body;
  const jid = number?.replace(/\D/g, "") + "@s.whatsapp.net";

  try {
    const response = await fetch(url);
    const buffer = Buffer.from(await response.arrayBuffer());
    const mimeType = response.headers.get("content-type") || mime.lookup(url);
    const fileName = path.basename(url);

    await sock.sendMessage(jid, {
      document: buffer,
      mimetype: mimeType,
      fileName,
      caption,
    });

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


// ==============================
// ▶️ START SERVER
// ==============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 WA Gateway aktif di http://localhost:${PORT}`);
});
