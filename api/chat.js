// api/chat.js — Vercel Serverless Function
// This runs on Vercel's servers, so CORS is never an issue.
// Your PAT token stays here, never exposed to the browser.

const COZE_API_URL = "https://api.coze.com/v3/chat";
const BOT_ID = "7640860053468811317";
const PAT_TOKEN = process.env.COZE_PAT_TOKEN;

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Allow requests from your own Vercel domain
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  const { studentName, topic, strengths, weaknesses } = req.body;

  if (!studentName || !topic) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Build the prompt for the Coze bot
  const userMessage = `
Buatlah rapor naratif dan rubrik evaluasi Kurikulum Merdeka untuk siswa berikut:

**Nama Siswa:** ${studentName}
**Topik / Mata Pelajaran:** ${topic}
**Kelebihan / Capaian:** ${strengths}
**Kelemahan / Area Pengembangan:** ${weaknesses}

Tolong hasilkan:
1. **Narasi Rapor** — paragraf formal 3-4 kalimat yang mendeskripsikan perkembangan siswa.
2. **Rubrik Evaluasi** — tabel markdown dengan kolom: Aspek | Capaian | Catatan.
`.trim();

  try {
    // Create a new conversation first
    const convRes = await fetch("https://api.coze.com/v1/conversation/create", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${PAT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const convData = await convRes.json();
    const conversationId = convData?.data?.id;

    if (!conversationId) {
      throw new Error("Failed to create conversation: " + JSON.stringify(convData));
    }

    // Now send the chat with streaming
    const cozeRes = await fetch(COZE_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${PAT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        bot_id: BOT_ID,
        conversation_id: conversationId,
        user_id: "rapor-user-001",
        stream: true,
        auto_save_history: false,
        additional_messages: [
          {
            role: "user",
            content: userMessage,
            content_type: "text",
          },
        ],
      }),
    });

    if (!cozeRes.ok) {
      const errText = await cozeRes.text();
      throw new Error(`Coze API error ${cozeRes.status}: ${errText}`);
    }

    // Stream the response directly to the client
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const reader = cozeRes.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      res.write(chunk);
    }

    res.end();
  } catch (err) {
    console.error("Proxy error:", err);
    // If streaming hasn't started, send JSON error
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.end();
    }
  }
}
