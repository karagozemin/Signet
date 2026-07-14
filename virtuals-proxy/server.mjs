import express from "express";
import dotenv from "dotenv";

dotenv.config();

const {
  VIRTUALS_API_KEY,
  VIRTUALS_BASE_URL = "https://compute.virtuals.io/v1",
  PORT = 3001,
} = process.env;

if (!VIRTUALS_API_KEY) {
  console.error("❌ VIRTUALS_API_KEY tanimli degil. .env dosyani kontrol et.");
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: "25mb" }));

// --- Basit loglama ---
app.use((req, _res, next) => {
  console.log(`→ ${req.method} ${req.url}`);
  next();
});

// Model adi eslemeleri (Roo/Continue -> Virtuals)
const MODEL_MAP = {
  "claude-opus-4.8": "claude-opus-4-8",
};

// Bos / anlamsiz mesajlari temizle
function cleanMessages(messages) {
  if (!Array.isArray(messages)) return messages;
  return messages.filter((m) => {
    if (!m || m.content == null) return false;
    if (typeof m.content === "string" && m.content.trim() === "") return false;
    return true;
  });
}

// Gelen body'yi Virtuals'in bekledigi hale getir
function transformBody(body) {
  const out = { ...body };

  if (out.model && MODEL_MAP[out.model]) {
    out.model = MODEL_MAP[out.model];
  }

  if (out.messages) {
    out.messages = cleanMessages(out.messages);
  }

  return out;
}

// --- Ana endpoint: Chat Completions ---
app.post("/v1/chat/completions", async (req, res) => {
  const body = transformBody(req.body);
  const isStream = body.stream === true;

  try {
    const upstream = await fetch(`${VIRTUALS_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${VIRTUALS_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    // Hata durumunu oldugu gibi ilet
    if (!upstream.ok) {
      const text = await upstream.text();
      console.error(`⚠️  Upstream ${upstream.status}: ${text}`);
      res.status(upstream.status);
      res.set("Content-Type", upstream.headers.get("content-type") || "application/json");
      return res.send(text);
    }

    // Streaming'i oldugu gibi gecir (SSE)
    if (isStream) {
      res.set({
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.flushHeaders?.();

      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();

      req.on("close", () => reader.cancel().catch(() => {}));

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
      }
      return res.end();
    }

    // Normal JSON yanit
    const data = await upstream.json();
    return res.json(data);
  } catch (err) {
    console.error("💥 Proxy hatasi:", err);
    return res.status(502).json({
      error: {
        message: "Proxy upstream'e ulasamadi",
        detail: String(err?.message || err),
      },
    });
  }
});

// Modelleri listeleme (bazi editorler ister)
app.get("/v1/models", async (_req, res) => {
  try {
    const upstream = await fetch(`${VIRTUALS_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${VIRTUALS_API_KEY}` },
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: { message: String(err?.message || err) } });
  }
});

// Saglik kontrolu
app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`🚀 virtuals-proxy calisiyor: http://localhost:${PORT}/v1`);
  console.log(`   Upstream: ${VIRTUALS_BASE_URL}`);
});