PRICEWISE — Cloudflare Workers full-stack deployment package

This package combines the PriceWise frontend with a Cloudflare Worker API.

Files:
  _worker.js       Server-side /api/compare and /api/status
  public/          Frontend assets
  wrangler.jsonc   Cloudflare Workers static-assets configuration

API provider environment secrets expected by _worker.js:
  FK_AFFILIATE_ID
  FK_AFFILIATE_TOKEN
  AMAZON_CLIENT_ID
  AMAZON_CLIENT_SECRET
  AMAZON_PARTNER_TAG
  AMAZON_TOKEN_URL = https://api.amazon.co.uk/auth/o2/token (normal variable, not a secret)

IMPORTANT:
- Do not put API credentials in public/app.js or public/index.html.
- Do not paste API credentials into ChatGPT.
- No prices/history are fabricated by this package.
- Price history is intentionally not claimed until a persistent database/snapshot store is connected.

Recommended deployment path:
  npx wrangler deploy

Cloudflare will deploy the Worker and public assets together.
