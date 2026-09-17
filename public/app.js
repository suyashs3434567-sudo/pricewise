const form=document.querySelector("#searchForm"),q=document.querySelector("#query"),results=document.querySelector("#results"),updated=document.querySelector("#updated");
form.addEventListener("submit",async e=>{e.preventDefault();await search(q.value)});
document.querySelectorAll("[data-q]").forEach(b=>b.onclick=()=>{q.value=b.dataset.q;search(q.value)});
document.querySelector("#extensionBtn").onclick=()=>alert("Install the Chrome extension from the /extension folder after loading it in chrome://extensions.");
async function search(term){
  term=term.trim();
  if(!term)return;
  updated.textContent="Searching…";
  results.innerHTML='<div class="card empty"><div class="emptyIcon">◌</div><h3>Checking providers…</h3><p>Getting current data.</p></div>';
  try{
    const res=await fetch("/api/compare?q="+encodeURIComponent(term));
    const d=await res.json();
    if(!res.ok)throw Error(d.error||"Request failed");
    updated.textContent="Updated "+new Date(d.fetchedAt).toLocaleString();
    const providerNote=`<div class="providerNote">Amazon: ${d.providers?.amazon?.configured?"connected":"not configured"} · Flipkart: ${d.providers?.flipkart?.configured?"connected":"not configured"}</div>`;
    const cards=d.matches?.length?d.matches.map(card).join(""):'<div class="card empty"><h3>No results</h3><p>No configured provider returned a usable result.</p></div>';
    results.innerHTML=providerNote+cards;
  }catch(e){
    updated.textContent="";
    results.innerHTML=`<div class="card empty"><h3>Could not compare</h3><p>${esc(e.message)}</p></div>`;
  }
}
function card(m){const a=m.amazon,f=m.flipkart,title=a?.title||f?.title||"Product";return `<article class="productCard card"><div class="productTop"><div><span class="kicker">MATCHED PRODUCT</span><h3 class="productTitle">${esc(title)}</h3></div>${m.lowestCurrentPrice!=null?`<span class=best>✦ BEST ${money(m.lowestCurrentPrice)}</span>`:""}</div><div class=stores>${store("Amazon",a,m.lowestStore==="Amazon")}${store("Flipkart",f,m.lowestStore==="Flipkart")}</div><div class=historyBox>📈 <b>Price history:</b> collecting real snapshots. No invented lows or averages. &nbsp; <b>Buy signal:</b> ${m.buyWait==="INSUFFICIENT_HISTORY"?"Need more history":"Ready"}</div></article>`}
function store(n,p,best){if(!p)return `<div class=store><div class=storeName>${n}</div><p class=storeMeta>Not found / unavailable for this search.</p></div>`;return `<div class="store ${best?"bestStore":""}"><div class=storeName>${n} ${best?"· BEST":""}</div><div class=price>${p.price==null?"—":money(p.price)}</div><div class=storeMeta>⭐ ${p.rating??"—"} · ${p.reviewCount??"—"} reviews</div>${p.url?`<a href="${esc(p.url)}" target=_blank rel=noopener>Open listing ↗</a>`:""}</div>`}
function money(n){return "₹"+Number(n).toLocaleString("en-IN")}function esc(x){return String(x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
