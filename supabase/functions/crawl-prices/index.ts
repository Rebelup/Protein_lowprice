/**
 * crawl-prices Edge Function  v6.0
 * v6.0: 영어→한글 번역, 맛+중량+가격 variants JSONB, group_id, is_drink
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
const REQ_TIMEOUT = 8_000;
const SITE_TIMEOUT = 40_000;

/* ── 번역 맵 ─────────────────────────────────────────────── */
const KO_MAP: Record<string, string> = {
  'chocolate milkshake':'초콜릿 밀크쉐이크','chocolate':'초콜릿',
  'vanilla ice cream':'바닐라 아이스크림','vanilla':'바닐라',
  'strawberry milkshake':'딸기 밀크쉐이크','strawberry':'딸기',
  'cookies and cream':'쿠키앤크림','cookies & cream':'쿠키앤크림',
  'banana cream':'바나나 크림','banana':'바나나',
  'salted caramel':'솔티드 카라멜','caramel':'카라멜',
  'peanut butter chocolate':'피넛버터 초콜릿','peanut butter':'피넛버터',
  'mocha':'모카','cappuccino':'카푸치노','coffee':'커피','latte':'라떼',
  'unflavored':'무맛','unflavoured':'무맛','natural':'내추럴',
  'birthday cake':'버스데이 케이크','cinnamon roll':'시나몬롤','cinnamon':'시나몬',
  'rocky road':'로키로드','white chocolate':'화이트 초콜릿','dark chocolate':'다크 초콜릿',
  'hazelnut':'헤이즐넛','coconut':'코코넛','almond':'아몬드',
  'double chocolate':'더블 초콜릿','fudge brownie':'퍼지 브라우니','brownie':'브라우니',
  'mango':'망고','peach':'복숭아','lemon':'레몬','lime':'라임',
  'watermelon':'수박','blueberry':'블루베리','raspberry':'라즈베리',
  'cherry':'체리','berry':'베리','tropical':'트로피칼',
  'passion fruit':'패션프루트','apple':'사과','grape':'포도','grapefruit':'자몽',
  'milk tea':'밀크티','matcha':'말차','green tea':'녹차',
  'red velvet':'레드벨벳','cheesecake':'치즈케이크','cotton candy':'솜사탕',
  'orange':'오렌지','mint chocolate':'민트 초콜릿','mint':'민트',
  'tiramisu':'티라미수','toffee':'토피','maple syrup':'메이플 시럽','maple':'메이플',
  'key lime':'키라임','fruit punch':'프루트펀치','lemonade':'레모네이드',
  'blue raspberry':'블루 라즈베리','bubblegum':'버블검',
  'gold standard':'골드 스탠다드','true mass':'트루 매스',
  'pre-workout':'프리워크아웃','pre workout':'프리워크아웃',
};

function translateKo(text: string): string {
  if (!text) return text;
  const sorted = Object.entries(KO_MAP).sort((a,b) => b[0].length - a[0].length);
  let result = text;
  for (const [en, ko] of sorted) {
    result = result.replace(new RegExp(en.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'gi'), ko);
  }
  return result;
}

function isDrinkProduct(tags: string[], type: string, title: string): boolean {
  const s = [...tags, type, title].join(' ').toLowerCase();
  if (/\brtd\b|ready[\s-]to[\s-]drink|energy\s*drink|liquid\s*shot/.test(s)) return true;
  if (/powder|분말|파우더|가루|mix/.test(s)) return false;
  return /\bdrink\b/.test(s);
}

/* ── 인터페이스 ─────────────────────────────────────────── */
interface VariantItem { flavor: string; weight: string; original_price: number; sale_price: number; }
interface ScrapedProduct {
  name: string; brand: string; store: string; category: string;
  original_price: number; sale_price: number; link: string;
  thumbnail?: string; emoji?: string;
  flavor?: string; weight?: string; available_flavors?: string[];
  variants?: VariantItem[]; group_id?: string; is_drink?: boolean;
}
interface ScrapedEvent {
  brand: string; brand_label: string; name: string; description?: string;
  discount_pct?: number; color?: string; active: boolean;
  start_date?: string; end_date?: string; link?: string;
  conditions?: string[]; coupon_code?: string; coupon_note?: string;
}
interface SiteResult { site: string; products: ScrapedProduct[]; events: ScrapedEvent[]; error?: string; debug?: string; }
interface ShopifyVariant { price: string; compare_at_price: string | null; title?: string; option1?: string; option2?: string; option3?: string; }
interface ShopifyProduct {
  title: string; product_type: string; tags: string[];
  handle: string; images: { src: string }[];
  variants: ShopifyVariant[];
  options?: { name: string; values: string[] }[];
}

/* ── 헬퍼 ───────────────────────────────────────────────── */
const HEADERS = {
  'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language':'ko-KR,ko;q=0.9,en;q=0.8','Cache-Control':'no-cache',
};
async function getHtml(url: string, ref = ''): Promise<string> {
  const r = await fetch(url, { headers:{...HEADERS, Accept:'text/html,application/xhtml+xml',...(ref?{Referer:ref}:{})}, signal:AbortSignal.timeout(REQ_TIMEOUT) });
  if (!r.ok) throw new Error(`HTTP ${r.status} — ${url}`);
  return r.text();
}
async function getJson<T>(url: string, ref = ''): Promise<T> {
  const r = await fetch(url, { headers:{...HEADERS, Accept:'application/json',...(ref?{Referer:ref}:{})}, signal:AbortSignal.timeout(REQ_TIMEOUT) });
  if (!r.ok) throw new Error(`HTTP ${r.status} — ${url}`);
  return r.json() as Promise<T>;
}
function withSiteTimeout(fn: () => Promise<SiteResult>, site: string): Promise<SiteResult> {
  return Promise.race([fn(), new Promise<SiteResult>(resolve => setTimeout(() => resolve({site,products:[],events:[],error:`timeout`}), SITE_TIMEOUT))]);
}
function krw(v: unknown): number { const n=Number(String(v??'').replace(/[^0-9]/g,'')); return isNaN(n)?0:n; }
function shopifyCat(tags: string[], type: string): string {
  const s=[...tags,type].join(' ').toLowerCase();
  if(/protein|프로틴|단백질|gainer|mass/.test(s)) return '단백질 파우더';
  if(/creatine|크레아틴/.test(s)) return '크레아틴';
  if(/bcaa|amino|아미노/.test(s)) return 'BCAA';
  if(/vitamin|비타민/.test(s)) return '영양제';
  return '보충제';
}
function classifyByName(name: string): string {
  const n=name.toLowerCase();
  if(/bcaa|amino|아미노/.test(n)) return 'BCAA';
  if(/creatine|크레아틴/.test(n)) return '크레아틴';
  if(/vitamin|비타민|omega/.test(n)) return '영양제';
  return '단백질 파우더';
}

function parseShopifyVariants(variants: ShopifyVariant[], options: {name:string}[] = []): VariantItem[] {
  const fi = options.findIndex(o => /flav|맛|taste/i.test(o.name));
  const si = options.findIndex(o => /size|weight|용량|gram|lb/i.test(o.name));
  const items: VariantItem[] = [];
  for (const v of variants) {
    const sale = krw(v.price); if(!sale) continue;
    const orig = krw(v.compare_at_price)||sale;
    const getOpt = (i:number) => i===0?v.option1??'':i===1?v.option2??'':i===2?v.option3??'':'';
    let flavorRaw='', weightRaw='';
    if(fi>=0 && si>=0){ flavorRaw=getOpt(fi); weightRaw=getOpt(si); }
    else if(fi>=0){ flavorRaw=getOpt(fi); }
    else if(si>=0){ weightRaw=getOpt(si); flavorRaw=v.option1??v.title??''; }
    else { flavorRaw=v.option1??v.title??''; weightRaw=v.option2??''; }
    items.push({ flavor:translateKo(flavorRaw.trim()), weight:weightRaw.trim(), original_price:orig, sale_price:sale });
  }
  return items;
}

/* ═══ 1. BSN ═══════════════════════════════════════════ */
async function scrapeBSN(): Promise<SiteResult> {
  const products: ScrapedProduct[] = []; const events: ScrapedEvent[] = [];
  try {
    for (let page=1;page<=10;page++) {
      const d = await getJson<{products:ShopifyProduct[]}>(`https://www.bsn.co.kr/products.json?limit=250&page=${page}`,'https://www.bsn.co.kr/');
      if(!d.products?.length) break;
      for (const p of d.products) {
        const allVariants = parseShopifyVariants(p.variants, p.options);
        if(!allVariants.length) continue;
        const first=allVariants[0];
        products.push({
          name:p.title, brand:'BSN', store:'BSN',
          category:shopifyCat(p.tags,p.product_type),
          original_price:first.original_price, sale_price:first.sale_price,
          link:`https://www.bsn.co.kr/products/${p.handle}`,
          thumbnail:p.images[0]?.src, emoji:'💪',
          flavor:first.flavor, weight:first.weight,
          available_flavors:[...new Set(allVariants.map(v=>v.flavor).filter(Boolean))],
          variants:allVariants, group_id:`bsn_${p.handle}`,
          is_drink:isDrinkProduct(p.tags,p.product_type,p.title),
        });
      }
      if(d.products.length<250) break;
    }
    try {
      const h = await getHtml('https://www.bsn.co.kr/pages/lets-bsn','https://www.bsn.co.kr/');
      const disc=h.match(/(\d+)\s*%/)?.[1]; const end=h.match(/(\d{4})[.\-](\d{2})[.\-](\d{2})/);
      events.push({ brand:'bsn',brand_label:'BSN',name:"BSN Let's BSN 이벤트",description:'BSN 공식 홈페이지 구매 시 할인.',discount_pct:disc?+disc:20,color:'#E53935',active:true,end_date:end?`${end[1]}-${end[2]}-${end[3]}`:undefined,link:'https://www.bsn.co.kr/pages/lets-bsn',conditions:['BSN 공식 홈페이지(bsn.co.kr)에서 구매 시 적용'] });
    } catch { /* 스킵 */ }
  } catch(e) { return {site:'BSN',products,events,error:(e as Error).message}; }
  return {site:'BSN',products,events};
}

/* ═══ 2. ON ════════════════════════════════════════════ */
async function scrapeON(): Promise<SiteResult> {
  const products: ScrapedProduct[] = []; const events: ScrapedEvent[] = [];
  const BASE='https://www.optimumnutrition.com/ko-kr';
  try {
    for (let page=1;page<=10;page++) {
      const d = await getJson<{products:ShopifyProduct[]}>(`${BASE}/products.json?limit=250&page=${page}`,`${BASE}/`);
      if(!d.products?.length) break;
      for (const p of d.products) {
        const allVariants = parseShopifyVariants(p.variants, p.options);
        if(!allVariants.length) continue;
        const first=allVariants[0];
        products.push({
          name:translateKo(p.title), brand:'ON (Optimum Nutrition)', store:'ON 공식몰',
          category:shopifyCat(p.tags,p.product_type),
          original_price:first.original_price, sale_price:first.sale_price,
          link:`${BASE}/products/${p.handle}`,
          thumbnail:p.images[0]?.src, emoji:'🥇',
          flavor:first.flavor, weight:first.weight,
          available_flavors:[...new Set(allVariants.map(v=>v.flavor).filter(Boolean))],
          variants:allVariants, group_id:`on_${p.handle}`,
          is_drink:isDrinkProduct(p.tags,p.product_type,p.title),
        });
      }
      if(d.products.length<250) break;
    }
    try {
      const h=await getHtml(`${BASE}/pages/promotions`,`${BASE}/`);
      const disc=h.match(/(\d+)\s*%/)?.[1];
      if(disc) events.push({brand:'on',brand_label:'Optimum Nutrition',name:'ON 공식몰 프로모션',description:`최대 ${disc}% 할인 진행 중.`,discount_pct:+disc,color:'#FFB300',active:true,link:`${BASE}/pages/promotions`});
    } catch { /* 스킵 */ }
  } catch(e) { return {site:'ON',products,events,error:(e as Error).message}; }
  return {site:'ON',products,events};
}

/* ═══ 3. MyProtein ═════════════════════════════════════ */
function extractProductsFromNextProps(pp: Record<string,unknown>): Record<string,unknown>[] {
  return (pp?.products?.products??pp?.categoryPage?.products?.products??pp?.categoryPage?.productList?.products??pp?.initialData?.products?.products??pp?.productListPage?.products?.products??pp?.serverProps?.initialData?.products?.products??pp?.data?.productListPage?.products?.products??pp?.listingPage?.products?.products??pp?.pageData?.products?.products??(pp?.products as Record<string,unknown>)?.list??[]) as Record<string,unknown>[];
}
function parseNextData(html: string): {products:Record<string,unknown>[];debug:string} {
  let si=html.indexOf('<script id="__NEXT_DATA__"'); if(si===-1) si=html.indexOf("<script id='__NEXT_DATA__'");
  if(si===-1) return {products:[],debug:`no __NEXT_DATA__`};
  const js=html.indexOf('>',si)+1; const je=html.indexOf('</script>',js);
  if(je===-1) return {products:[],debug:'tag not closed'};
  try {
    const nd=JSON.parse(html.slice(js,je).trim());
    const pp=(nd?.props?.pageProps??{}) as Record<string,unknown>;
    const prods=extractProductsFromNextProps(pp);
    return prods.length>0?{products:prods,debug:`OK:${prods.length}`}:{products:[],debug:`keys=[${Object.keys(pp).slice(0,6).join(',')}]`};
  } catch(e) { return {products:[],debug:`JSON err:${(e as Error).message}`}; }
}
function mapThgProduct(p: Record<string,unknown>, cat: string, base: string): ScrapedProduct|null {
  const priceObj=(p?.price??{}) as Record<string,unknown>;
  const sale=krw(priceObj?.value??(p?.specialOffer as Record<string,unknown>)?.price??0);
  if(!sale) return null;
  const orig=krw(priceObj?.rrp??sale);
  const imgList=((p?.images as Record<string,unknown>)?.list as {url:string}[])??[];
  const defImg=(p?.images as Record<string,unknown>)?.defaultImage as {url:string}|undefined;
  const thumb=imgList[0]?.url??defImg?.url??undefined;
  const url=String(p?.url??p?.canonicalUrl??'');
  const name=translateKo(String(p.title??p.name??'').trim());
  if(!name) return null;
  const thgV=(p?.variants as Record<string,unknown>[])??[];
  const parsedV: VariantItem[]=[];
  for(const v of thgV) {
    const vp=(v?.priceInfo??v?.price??{}) as Record<string,unknown>;
    const vs=krw(vp?.price??vp?.value??0); if(!vs) continue;
    const vo=krw(vp?.rrp??vs);
    const ch=(v?.choices as {key:string;value:string}[])??[];
    const fc=ch.find(c=>/flav|taste|맛/i.test(c.key));
    const sc=ch.find(c=>/size|weight|용량/i.test(c.key));
    parsedV.push({ flavor:translateKo(fc?.value??String(v?.title??'').split('/')[0]?.trim()??''), weight:sc?.value??String(v?.title??'').split('/')[1]?.trim()??'', original_price:vo, sale_price:vs });
  }
  const first=parsedV[0];
  const slug=url.split('/').filter(Boolean).pop()?.split('?')[0]??'';
  return {
    name, brand:'마이프로틴', store:'마이프로틴', category:cat,
    original_price:first?.original_price??orig, sale_price:first?.sale_price??sale,
    link:url.startsWith('http')?url:`${base}${url}`,
    thumbnail:thumb, emoji:'🔵',
    flavor:first?.flavor, weight:first?.weight,
    available_flavors:parsedV.length?[...new Set(parsedV.map(v=>v.flavor).filter(Boolean))]:undefined,
    variants:parsedV.length?parsedV:undefined,
    group_id:slug?`mp_${slug}`:undefined, is_drink:false,
  };
}
async function scrapeMyProtein(): Promise<SiteResult> {
  const products: ScrapedProduct[]=[]; const events: ScrapedEvent[]=[]; const dbg: string[]=[];
  const BASE='https://www.myprotein.co.kr';
  const CATS: [string,string][]=[
    ['/c/protein/','단백질 파우더'],['/c/creatine/','크레아틴'],
    ['/c/amino-acids/','BCAA'],['/c/vitamins-and-supplements/','영양제'],
  ];
  let buildId='';
  try { const mh=await getHtml(`${BASE}/`,`${BASE}/`); const bm=mh.match(/buildId[^:]*:[^"]*"([A-Za-z0-9_\-]{8,})"/); buildId=bm?.[1]??''; dbg.push(`buildId=${buildId||'x'}`); }
  catch(e){ dbg.push(`main err:${(e as Error).message}`); }
  for (const [path,cat] of CATS) {
    let got=false;
    if(buildId&&!got) {
      try {
        const cp=path.replace(/^\/|\/$/g,'');
        const data=await getJson<{pageProps?:Record<string,unknown>}>(`${BASE}/_next/data/${buildId}/${cp}.json?pageSize=96`,`${BASE}/`);
        const prods=extractProductsFromNextProps(data?.pageProps??{});
        if(prods.length>0){ prods.forEach(p=>{const sp=mapThgProduct(p,cat,BASE);if(sp)products.push(sp);}); dbg.push(`[${cat}]api:${prods.length}`); got=true; }
      } catch(e){ dbg.push(`[${cat}]api err:${(e as Error).message}`); }
    }
    if(!got) {
      try {
        const html=await getHtml(`${BASE}${path}?pageSize=96`,`${BASE}/`);
        const {products:list,debug:pd}=parseNextData(html);
        dbg.push(`[${cat}]html:${pd}`);
        if(list.length>0){ list.forEach(p=>{const sp=mapThgProduct(p,cat,BASE);if(sp)products.push(sp);}); got=true; }
      } catch(e){ dbg.push(`[${cat}]html err:${(e as Error).message}`); }
    }
  }
  try {
    const h=await getHtml(`${BASE}/c/voucher-codes/`,`${BASE}/`);
    const discs=[...h.matchAll(/(\d+)\s*%/g)].map(m=>+m[1]).filter(n=>n>0&&n<=80);
    const max=discs.length?Math.max(...discs):35;
    events.push({ brand:'myprotein',brand_label:'마이프로틴',name:'마이프로틴 할인코드 모음',description:`할인 코드 적용 시 최대 ${max}% 추가 할인.`,discount_pct:max,color:'#0077CC',active:true,end_date:'2026-12-31',link:`${BASE}/c/voucher-codes/`,conditions:['마이프로틴 공식 홈페이지(myprotein.co.kr)에서 구매 시 적용'] });
  } catch { /* 스킵 */ }
  return {site:'MyProtein',products,events,debug:dbg.join(' || ')};
}

/* ═══ 4. NS Store ══════════════════════════════════════ */
async function scrapeNSStore(): Promise<SiteResult> {
  const products: ScrapedProduct[]=[]; const events: ScrapedEvent[]=[]; const dbg: string[]=[];
  const BASE='https://www.ns-store.co.kr';
  const catCodes=new Set<string>();
  try { const mh=await getHtml(`${BASE}/`,`${BASE}/`); for(const cm of mh.matchAll(/cateCd=(\d{3,})/g)) catCodes.add(cm[1]); dbg.push(`cats=${catCodes.size}`); }
  catch(e){ dbg.push(`main err:${(e as Error).message}`); }
  const codes=catCodes.size>0?[...catCodes].slice(0,6):['0100000001','0100000002','001001','001002','0001','0002'];
  for(const code of codes) {
    try {
      const html=await getHtml(`${BASE}/goods/goods_list.php?cateCd=${code}`,`${BASE}/`);
      const before=products.length;
      const imgMap: Record<string,string>={};
      for(const im of html.matchAll(/goodsNo=(\d+)[^\s"]*[\s\S]{0,800}?<img[^>]+(?:src|data-src)="((?:https?:)?\/\/[^"]+\.(jpg|jpeg|png|webp)(?:\?[^"]*)?)"/gi)) {
        if(!imgMap[im[1]]) imgMap[im[1]]=im[2].startsWith('//')?'https:'+im[2]:im[2];
      }
      const re1=/href="(\/goods\/goods_view\.php\?goodsNo=(\d+)[^"]*)"[\s\S]{0,3000}?(?:class="[^"]*(?:goods_name|item_name|prd_name|name)[^"]*"[^>]*>|<strong\s+class="[^"]*name[^"]*"[^>]*>)\s*(?:<[^>]+>)*\s*([^<]{2,120})\s*(?:<\/[^>]+>)*[\s\S]{0,1000}?(?:class="[^"]*(?:sale_?price|final_?price|goods_price|selling_price|price)[^"]*"[^>]*>[\s<>\/a-z"=]*)((?:\d{1,3},)*\d{1,3})/g;
      for(const m of html.matchAll(re1)){ const sale=krw(m[4]);if(!sale)continue;const name=translateKo(m[3].trim().replace(/\s+/g,' '));products.push({name,brand:'NS',store:'NS스토어',category:classifyByName(name),original_price:sale,sale_price:sale,link:`${BASE}${m[1]}`,thumbnail:imgMap[m[2]],emoji:'🟢'}); }
      if(products.length===before){
        const re2=/href="(\/goods\/goods_view\.php\?goodsNo=(\d+))"[^>]*>[\s\S]{0,200}?alt="([^"]{3,120})"[\s\S]{0,2000}?((?:\d{1,3},)*\d{1,3})원/g;
        for(const m of html.matchAll(re2)){ const sale=krw(m[4]);if(!sale)continue;const name=translateKo(m[3].trim());products.push({name,brand:'NS',store:'NS스토어',category:classifyByName(name),original_price:sale,sale_price:sale,link:`${BASE}${m[1]}`,thumbnail:imgMap[m[2]],emoji:'🟢'}); }
      }
      const added=products.length-before; if(added>0) dbg.push(`code=${code}:+${added}`);
    } catch(e){ dbg.push(`code=${code}:${(e as Error).message}`); }
  }
  const seen=new Set<string>(); const uniq=products.filter(p=>{if(seen.has(p.link))return false;seen.add(p.link);return true;});
  products.length=0; uniq.forEach(p=>products.push(p));
  try {
    const html=await getHtml(`${BASE}/event/event_list.php`,`${BASE}/`);
    const re=/href="(\/event\/event_view\.php\?[^"]+)"[\s\S]{0,600}?(?:class="[^"]*(?:subject|tit)[^"]*"|<strong>)\s*([^<]{5,100})/g;
    for(const m of [...html.matchAll(re)].slice(0,5)) events.push({brand:'ns',brand_label:'NS스토어',name:m[2].trim().replace(/\s+/g,' '),description:'NS스토어 진행 중인 이벤트.',color:'#4CAF50',active:true,link:`${BASE}${m[1]}`});
  } catch { /* 스킵 */ }
  return {site:'NSStore',products,events,debug:dbg.join(' || ')};
}

/* ── DB 업서트 ──────────────────────────────────────────── */
async function upsertProducts(prods: ScrapedProduct[]) {
  let ins=0,upd=0;
  for(const p of prods) {
    if(!p.name?.trim()) continue;
    const {data:ex} = p.group_id
      ? await supabase.from('products').select('id').eq('group_id',p.group_id).maybeSingle()
      : await supabase.from('products').select('id').eq('name',p.name).eq('store',p.store).maybeSingle();
    const payload: Record<string,unknown> = {
      sale_price:p.sale_price, original_price:p.original_price, link:p.link,
      updated_at:new Date().toISOString(),
      ...(p.thumbnail?{thumbnail:p.thumbnail}:{}),
      ...(p.flavor!==undefined?{flavor:p.flavor}:{}),
      ...(p.weight!==undefined?{weight:p.weight}:{}),
      ...(p.available_flavors?{available_flavors:p.available_flavors}:{}),
      ...(p.variants?{variants:p.variants}:{}),
      ...(p.group_id?{group_id:p.group_id}:{}),
      ...(p.is_drink!==undefined?{is_drink:p.is_drink}:{}),
    };
    if(ex) { await supabase.from('products').update(payload).eq('id',ex.id); upd++; }
    else {
      const {error}=await supabase.from('products').insert({ name:p.name,brand:p.brand,store:p.store,category:p.category??classifyByName(p.name),emoji:p.emoji??'💊',scrape_url:p.link,...payload });
      if(!error) ins++; else console.error('insert err:',error.message,p.name);
    }
  }
  return {inserted:ins,updated:upd};
}
async function upsertEvents(evts: ScrapedEvent[]) {
  for(const e of evts) {
    const {data:ex}=await supabase.from('events').select('id').eq('brand',e.brand).eq('name',e.name).maybeSingle();
    if(ex) await supabase.from('events').update({active:e.active,end_date:e.end_date??null,discount_pct:e.discount_pct??null,description:e.description??null,coupon_code:e.coupon_code??null}).eq('id',ex.id);
    else await supabase.from('events').insert(e);
  }
}

/* ── 메인 핸들러 ─────────────────────────────────────────── */
Deno.serve(async (req) => {
  const body=await req.json().catch(()=>({})) as {sites?:string[]};
  const targets=body.sites??['bsn','on','myprotein','nsstore'];
  const scrapers: Record<string,()=>Promise<SiteResult>>={bsn:scrapeBSN,on:scrapeON,myprotein:scrapeMyProtein,nsstore:scrapeNSStore};
  const summary: Record<string,unknown>={};
  for(const site of targets) {
    if(!scrapers[site]) continue;
    try {
      const r=await withSiteTimeout(scrapers[site],site);
      const [{inserted,updated}]=await Promise.all([upsertProducts(r.products),upsertEvents(r.events)]);
      summary[site]={products_found:r.products.length,inserted,updated,events_found:r.events.length,error:r.error??null,debug:r.debug??null};
    } catch(e){ summary[site]={error:(e as Error).message}; }
  }
  await supabase.from('crawl_logs').insert({ran_at:new Date().toISOString(),summary});
  return new Response(JSON.stringify({ok:true,ran_at:new Date().toISOString(),summary}),{headers:{'Content-Type':'application/json'}});
});
