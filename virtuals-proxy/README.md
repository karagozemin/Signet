# virtuals-proxy

OpenAI uyumlu kucuk bir proxy. Roo, Continue, Cline, Kilo gibi araclar `localhost`'a
baglanir; biz de istekleri Virtuals Compute'un bekledigi formata cevirip ileteriz.

```
Roo / Continue / Cline
        |
        v  http://localhost:3001/v1
        |
        v  Proxy (bu proje)
        |
        v  https://compute.virtuals.io/v1
```

## Proxy ne yapiyor?

- ✅ Bos `content` mesajlarini siler.
- ✅ Gerekirse model adini duzeltir (`claude-opus-4.8` -> `claude-opus-4-8`).
- ✅ OpenAI Chat Completions formatini korur.
- ✅ Streaming'i (SSE) oldugu gibi gecirir.
- ✅ Ileride loglama, cache, rate limit, fallback eklenebilir.

## Kurulum

```bash
cd virtuals-proxy
npm install
```

`.env` dosyasi olustur (arac guvenlik nedeniyle otomatik olusturmuyor):

```bash
cat > .env <<'EOF'
VIRTUALS_API_KEY=acp-xxxxxxxx
VIRTUALS_BASE_URL=https://compute.virtuals.io/v1
PORT=3001
EOF
```

## Calistirma

```bash
npm start
# veya otomatik yeniden baslatma icin
npm run dev
```

Ciktida sunu gormelisin:

```
🚀 virtuals-proxy calisiyor: http://localhost:3001/v1
```

## Continue / Cline / Roo ayari

Base URL olarak sunu ver:

```
http://localhost:3001/v1
```

Artik editorun Virtuals'a degil bize konusur.

## Test

```bash
curl http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-opus-4.8",
    "messages": [{"role": "user", "content": "selam"}]
  }'
```

## Yol haritasi

- [ ] Claude doluysa Kimi / DeepSeek'e fallback
- [ ] Retry
- [ ] Cache
- [ ] Prompt loglama
- [ ] Coklu provider (OpenAI / Anthropic / Virtuals / OpenRouter) tek endpoint

## Lisans

MIT
