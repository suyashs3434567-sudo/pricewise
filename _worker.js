const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

function clean(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function tokens(s) {
  return new Set(clean(s).split(/\s+/).filter(x => x.length > 1));
}
function similarity(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const x of A) if (B.has(x)) hit++;
  return (2 * hit) / (A.size + B.size);
}
function amazonPrice(item) {
  const listings = item?.offersV2?.listings || [];
  const prices = listings.map(x => Number(x?.price?.money?.amount)).filter(Number.isFinite);
  return prices.length ? Math.min(...prices) : null;
}
function normalizeAmazon(item) {
  const title = item?.itemInfo?.title?.displayValue || "Amazon product";
  return {
    title,
    price: amazonPrice(item),
    rating: null,
    reviewCount: null,
    url: item?.detailPageURL || null,
    image: item?.images?.primary?.medium?.url || item?.images?.primary?.large?.url || null,
    id: item?.asin || null,
    brand: item?.itemInfo?.byLineInfo?.brand?.displayValue || null,
    store: "Amazon"
  };
}
function normalizeFlipkart(x) {
  const p = x?.productBaseInfoV1 || x?.productBaseInfo || x?.productAttributes || {};
  const ship = x?.productShippingInfoV1 || x?.productShippingBaseInfo || {};
  const price = p?.sellingPrice?.amount ?? p?.flipkartSellingPrice?.amount ?? p?.flipkartSpecialPrice?.amount ?? null;
  return {
    title: p?.title || "Flipkart product",
    price: Number.isFinite(Number(price)) ? Number(price) : null,
    rating: ship?.sellerAverageRating ?? null,
    reviewCount: ship?.sellerNoOfReviews ?? null,
    url: p?.productUrl || null,
    image: p?.imageUrls?.["400x400"] || p?.imageUrls?.["200x200"] || null,
    id: p?.productId || null,
    brand: p?.productBrand || null,
    store: "Flipkart"
  };
}

async function flipkartSearch(q, env) {
  if (!env.FK_AFFILIATE_ID || !env.FK_AFFILIATE_TOKEN) return { configured: false, items: [] };
  const u = new URL("https://affiliate-api.flipkart.net/affiliate/1.0/search.json");
  u.searchParams.set("query", q);
  u.searchParams.set("resultCount", "10");
  const r = await fetch(u, { headers: {
    "Fk-Affiliate-Id": env.FK_AFFILIATE_ID,
    "Fk-Affiliate-Token": env.FK_AFFILIATE_TOKEN
  }});
  if (!r.ok) throw new Error(`Flipkart API returned ${r.status}`);
  const d = await r.json();
  return { configured: true, items: (d.productInfoList || []).map(normalizeFlipkart).filter(x => x.title) };
}

async function amazonToken(env) {
  const endpoint = env.AMAZON_TOKEN_URL || "https://api.amazon.co.uk/auth/o2/token";
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: env.AMAZON_CLIENT_ID,
    client_secret: env.AMAZON_CLIENT_SECRET,
    scope: "creatorsapi::default"
  });
  const r = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  if (!r.ok) throw new Error(`Amazon auth returned ${r.status}`);
  return (await r.json()).access_token;
}
async function amazonSearch(q, env) {
  if (!env.AMAZON_CLIENT_ID || !env.AMAZON_CLIENT_SECRET || !env.AMAZON_PARTNER_TAG) return { configured: false, items: [] };
  const token = await amazonToken(env);
  const payload = {
    keywords: q,
    marketplace: "www.amazon.in",
    partnerTag: env.AMAZON_PARTNER_TAG,
    itemCount: 10,
    resources: [
      "itemInfo.title",
      "itemInfo.byLineInfo",
      "images.primary.medium",
      "offersV2.listings.price",
      "offersV2.listings.availability"
    ]
  };
  const r = await fetch("https://creatorsapi.amazon/catalog/v1/searchItems", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${token}`,
      "content-type": "application/json",
      "x-marketplace": "www.amazon.in"
    },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error(`Amazon API returned ${r.status}`);
  const d = await r.json();
  return { configured: true, items: (d.searchResult?.items || []).map(normalizeAmazon).filter(x => x.title) };
}

function pairResults(a, f) {
  const used = new Set();
  const out = [];
  for (const ap of a) {
    let best = -1, bestScore = 0;
    for (let i = 0; i < f.length; i++) {
      if (used.has(i)) continue;
      const s = similarity(ap.title, f[i].title);
      if (s > bestScore) { bestScore = s; best = i; }
    }
    if (best >= 0 && bestScore >= 0.62) {
      used.add(best);
      const fp = f[best];
      const low = [ap.price, fp.price].filter(Number.isFinite);
      const lowest = low.length ? Math.min(...low) : null;
      out.push({ amazon: ap, flipkart: fp, matchScore: Number(bestScore.toFixed(3)), lowestCurrentPrice: lowest, lowestStore: lowest == null ? null : (ap.price === lowest ? "Amazon" : "Flipkart"), buyWait: "INSUFFICIENT_HISTORY" });
    }
  }
  for (let i = 0; i < f.length; i++) {
    if (!used.has(i)) out.push({ amazon: null, flipkart: f[i], matchScore: 0, lowestCurrentPrice: f[i].price, lowestStore: "Flipkart", buyWait: "INSUFFICIENT_HISTORY" });
  }
  for (const ap of a) if (!out.some(x => x.amazon?.id === ap.id)) out.push({ amazon: ap, flipkart: null, matchScore: 0, lowestCurrentPrice: ap.price, lowestStore: "Amazon", buyWait: "INSUFFICIENT_HISTORY" });
  return out.slice(0, 10);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/compare") {
      const q = (url.searchParams.get("q") || "").trim();
      if (!q) return json({ error: "Enter a product to search." }, 400);
      try {
        const [amazon, flipkart] = await Promise.all([
          amazonSearch(q, env).catch(e => ({ configured: Boolean(env.AMAZON_CLIENT_ID), items: [], error: e.message })),
          flipkartSearch(q, env).catch(e => ({ configured: Boolean(env.FK_AFFILIATE_ID), items: [], error: e.message }))
        ]);
        const matches = pairResults(amazon.items, flipkart.items);
        return json({
          query: q,
          fetchedAt: new Date().toISOString(),
          providers: {
            amazon: { configured: amazon.configured, count: amazon.items.length, error: amazon.error || null },
            flipkart: { configured: flipkart.configured, count: flipkart.items.length, error: flipkart.error || null }
          },
          matches,
          note: "Only provider-returned data is shown. Price history is not fabricated."
        });
      } catch (e) {
        return json({ error: e.message || "Comparison failed." }, 502);
      }
    }
    if (url.pathname === "/api/status") {
      return json({
        amazonConfigured: Boolean(env.AMAZON_CLIENT_ID && env.AMAZON_CLIENT_SECRET && env.AMAZON_PARTNER_TAG),
        flipkartConfigured: Boolean(env.FK_AFFILIATE_ID && env.FK_AFFILIATE_TOKEN),
        history: "not configured"
      });
    }
    return env.ASSETS.fetch(request);
  }
};
