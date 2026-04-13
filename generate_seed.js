'use strict';
const brands = [
  {brand:'하림',     store:'쿠팡',        link:'https://www.coupang.com/np/search?q=하림+닭가슴살'},
  {brand:'하림',     store:'홈플러스',    link:'https://www.homeplus.co.kr/search?keyword=하림+닭가슴살'},
  {brand:'랭킹닭컴', store:'쿠팡',        link:'https://www.coupang.com/np/search?q=랭킹닭컴'},
  {brand:'랭킹닭컴', store:'마켓컬리',    link:'https://www.kurly.com/search?sword=랭킹닭컴'},
  {brand:'바디닭',   store:'쿠팡',        link:'https://www.coupang.com/np/search?q=바디닭+닭가슴살'},
  {brand:'바디닭',   store:'올리브영',    link:'https://www.oliveyoung.co.kr/store/search/getSearchMain.do?query=바디닭'},
  {brand:'굽네',     store:'쿠팡',        link:'https://www.coupang.com/np/search?q=굽네+닭가슴살'},
  {brand:'굽네',     store:'이마트',      link:'https://emart.ssg.com/search/search.ssg?query=굽네+닭가슴살'},
  {brand:'허닭',     store:'쿠팡',        link:'https://www.coupang.com/np/search?q=허닭+닭가슴살'},
  {brand:'허닭',     store:'마켓컬리',    link:'https://www.kurly.com/search?sword=허닭+닭가슴살'},
  {brand:'마니커',   store:'이마트',      link:'https://emart.ssg.com/search/search.ssg?query=마니커+닭가슴살'},
  {brand:'마니커',   store:'홈플러스',    link:'https://www.homeplus.co.kr/search?keyword=마니커+닭가슴살'},
  {brand:'제이닭',   store:'쿠팡',        link:'https://www.coupang.com/np/search?q=제이닭'},
  {brand:'네이처팜', store:'마켓컬리',    link:'https://www.kurly.com/search?sword=네이처팜+닭가슴살'},
  {brand:'체닭',     store:'쿠팡',        link:'https://www.coupang.com/np/search?q=체닭+닭가슴살'},
  {brand:'이지',     store:'이마트',      link:'https://emart.ssg.com/search/search.ssg?query=이지+닭가슴살'},
  {brand:'올가',     store:'마켓컬리',    link:'https://www.kurly.com/search?sword=올가+닭가슴살'},
  {brand:'닭신선생', store:'오늘의식탁',  link:'https://www.kurly.com/search?sword=닭신선생'},
  {brand:'맥스닭',   store:'쿠팡',        link:'https://www.coupang.com/np/search?q=맥스닭+닭가슴살'},
  {brand:'온닭',     store:'마켓컬리',    link:'https://www.kurly.com/search?sword=온닭+닭가슴살'},
];

const byCategory = {
  훈제: [
    {suf:'훈제 슬라이스 오리지널',  flavor:'오리지널', w:'100g×5팩',  g:500,  o:13900, s:8990,  emoji:'🍗'},
    {suf:'훈제 슬라이스 무염',      flavor:'무염',     w:'100g×5팩',  g:500,  o:13900, s:9200,  emoji:'🍗'},
    {suf:'훈제 통구이 갈릭',        flavor:'갈릭',     w:'150g×3팩',  g:450,  o:12000, s:7490,  emoji:'🍗'},
    {suf:'훈제 통구이 매운맛',      flavor:'매운맛',   w:'150g×3팩',  g:450,  o:12000, s:7800,  emoji:'🌶️'},
    {suf:'훈제 대용량 오리지널',    flavor:'오리지널', w:'200g×5팩',  g:1000, o:22000, s:14900, emoji:'🍗'},
    {suf:'훈제 간장맛',             flavor:'간장',     w:'120g×4팩',  g:480,  o:15000, s:9900,  emoji:'🍗'},
    {suf:'훈제 슬림 무염',          flavor:'무염',     w:'80g×6팩',   g:480,  o:14400, s:8800,  emoji:'🍗'},
    {suf:'훈제 스모크 갈릭',        flavor:'갈릭',     w:'130g×5팩',  g:650,  o:16500, s:10500, emoji:'🍗'},
  ],
  냉동: [
    {suf:'냉동 닭가슴살 1kg',       flavor:'무염',     w:'1kg',       g:1000, o:19900, s:12900, emoji:'❄️'},
    {suf:'냉동 닭가슴살 2kg',       flavor:'무염',     w:'2kg',       g:2000, o:35000, s:22900, emoji:'❄️'},
    {suf:'냉동 큐브 갈릭',          flavor:'갈릭',     w:'500g×2팩',  g:1000, o:18000, s:11900, emoji:'❄️'},
    {suf:'냉동 스테이크 오리지널',  flavor:'오리지널', w:'150g×5팩',  g:750,  o:18500, s:12500, emoji:'❄️'},
    {suf:'냉동 슬라이스 매운맛',    flavor:'매운맛',   w:'500g',      g:500,  o:9900,  s:6500,  emoji:'🌶️'},
    {suf:'냉동 안심 무염',          flavor:'무염',     w:'1kg',       g:1000, o:21000, s:14800, emoji:'❄️'},
    {suf:'냉동 간장 양념',          flavor:'간장',     w:'600g×2팩',  g:1200, o:26000, s:17900, emoji:'❄️'},
  ],
  냉장: [
    {suf:'냉장 스테이크 오리지널',  flavor:'오리지널', w:'150g×3팩',  g:450,  o:12000, s:7990,  emoji:'🥩'},
    {suf:'냉장 스테이크 갈릭',      flavor:'갈릭',     w:'130g×4팩',  g:520,  o:14000, s:9500,  emoji:'🥩'},
    {suf:'냉장 스테이크 간장',      flavor:'간장',     w:'150g×3팩',  g:450,  o:12500, s:8200,  emoji:'🥩'},
    {suf:'냉장 구이 매운맛',        flavor:'매운맛',   w:'100g×4팩',  g:400,  o:11000, s:6990,  emoji:'🌶️'},
    {suf:'냉장 부드러운 무염',      flavor:'무염',     w:'200g×3팩',  g:600,  o:15000, s:9800,  emoji:'🥩'},
  ],
  통조림: [
    {suf:'통조림 무염',             flavor:'무염',     w:'135g×6캔',  g:810,  o:14400, s:8500,  emoji:'🥫'},
    {suf:'통조림 오리지널',         flavor:'오리지널', w:'135g×6캔',  g:810,  o:14400, s:9200,  emoji:'🥫'},
    {suf:'통조림 대용량 무염',      flavor:'무염',     w:'200g×4캔',  g:800,  o:13600, s:8900,  emoji:'🥫'},
    {suf:'통조림 간장맛',           flavor:'간장',     w:'135g×4캔',  g:540,  o:9600,  s:6200,  emoji:'🥫'},
  ],
  가공: [
    {suf:'닭가슴살 볼 오리지널',    flavor:'오리지널', w:'200g',      g:200,  o:6900,  s:4200,  emoji:'🍢'},
    {suf:'닭가슴살 볼 스파이시',    flavor:'매운맛',   w:'200g',      g:200,  o:6900,  s:4490,  emoji:'🌶️'},
    {suf:'닭가슴살 소시지',         flavor:'오리지널', w:'300g',      g:300,  o:7800,  s:4900,  emoji:'🌭'},
    {suf:'닭가슴살 햄 갈릭',        flavor:'갈릭',     w:'250g',      g:250,  o:8500,  s:5500,  emoji:'🍖'},
    {suf:'닭가슴살 스틱 간장',      flavor:'간장',     w:'150g×2팩',  g:300,  o:9000,  s:5800,  emoji:'🍢'},
    {suf:'닭가슴살 너겟 오리지널',  flavor:'오리지널', w:'250g',      g:250,  o:7500,  s:4800,  emoji:'🍗'},
  ],
};

const supple = [
  {name:'닥터린 WPI 분리유청 단백질 초코',     brand:'닥터린',   store:'쿠팡',     o:52000,s:31900,w:'1kg',   g:1000,emoji:'💪',link:'https://www.coupang.com/np/search?q=닥터린+WPI+단백질'},
  {name:'닥터린 WPI 분리유청 단백질 바닐라',   brand:'닥터린',   store:'쿠팡',     o:52000,s:32900,w:'1kg',   g:1000,emoji:'💪',link:'https://www.coupang.com/np/search?q=닥터린+WPI+바닐라'},
  {name:'마이프로틴 WPC 단백질 초코 스무스',   brand:'마이프로틴',store:'마켓컬리', o:49900,s:28000,w:'1kg',   g:1000,emoji:'💪',link:'https://www.kurly.com/search?sword=마이프로틴+WPC'},
  {name:'마이프로틴 WPC 단백질 바닐라 크림',   brand:'마이프로틴',store:'마켓컬리', o:49900,s:28500,w:'1kg',   g:1000,emoji:'💪',link:'https://www.kurly.com/search?sword=마이프로틴+바닐라'},
  {name:'ON 골드스탠다드 100% 웨이 더블초코',  brand:'ON',       store:'쿠팡',     o:89000,s:59900,w:'907g',  g:907, emoji:'💪',link:'https://www.coupang.com/np/search?q=ON+골드스탠다드+웨이'},
  {name:'ON 골드스탠다드 100% 웨이 바닐라아이스크림',brand:'ON', store:'쿠팡',     o:89000,s:61000,w:'907g',  g:907, emoji:'💪',link:'https://www.coupang.com/np/search?q=ON+골드스탠다드+바닐라'},
  {name:'GNC 프로퍼포먼스 웨이프로틴 초코',    brand:'GNC',      store:'올리브영', o:69900,s:45000,w:'816g',  g:816, emoji:'💪',link:'https://www.oliveyoung.co.kr/store/search/getSearchMain.do?query=GNC+웨이프로틴'},
  {name:'하이뮨 프로틴 밸런스 오리지널',       brand:'일동후디스',store:'이마트',   o:29900,s:18900,w:'400g',  g:400, emoji:'💊',link:'https://emart.ssg.com/search/search.ssg?query=하이뮨+프로틴+밸런스'},
  {name:'하이뮨 프로틴 밸런스 초코',           brand:'일동후디스',store:'이마트',   o:29900,s:19500,w:'400g',  g:400, emoji:'💊',link:'https://emart.ssg.com/search/search.ssg?query=하이뮨+프로틴+밸런스+초코'},
  {name:'렉토 크레아틴 모노하이드레이트 500g', brand:'렉토',     store:'올리브영', o:25900,s:14900,w:'500g',  g:500, emoji:'💊',link:'https://www.oliveyoung.co.kr/store/search/getSearchMain.do?query=렉토+크레아틴'},
  {name:'렉토 BCAA 아미노산 레몬맛',           brand:'렉토',     store:'올리브영', o:22900,s:13500,w:'300g',  g:300, emoji:'💊',link:'https://www.oliveyoung.co.kr/store/search/getSearchMain.do?query=렉토+BCAA'},
  {name:'웨이프로 뉴트리션 단백질 1kg 초코',   brand:'웨이프로', store:'쿠팡',     o:38000,s:22900,w:'1kg',   g:1000,emoji:'💪',link:'https://www.coupang.com/np/search?q=웨이프로+단백질'},
  {name:'이지프로틴 WPC 80 오리지널',          brand:'이지프로틴',store:'홈플러스', o:32000,s:19800,w:'900g',  g:900, emoji:'💪',link:'https://www.homeplus.co.kr/search?keyword=이지프로틴+WPC'},
  {name:'머슬팜 컴뱃 프로틴 초코우유',         brand:'머슬팜',   store:'쿠팡',     o:79900,s:52000,w:'1.8kg', g:1800,emoji:'💪',link:'https://www.coupang.com/np/search?q=머슬팜+컴뱃+프로틴'},
  {name:'나우푸드 웨이프로틴 초코 파지',        brand:'나우푸드', store:'마켓컬리', o:52000,s:36000,w:'907g',  g:907, emoji:'💪',link:'https://www.kurly.com/search?sword=나우푸드+웨이프로틴'},
  {name:'스포맥스 WPC 단백질 2kg 오리지널',    brand:'스포맥스', store:'홈플러스', o:59900,s:39900,w:'2kg',   g:2000,emoji:'💪',link:'https://www.homeplus.co.kr/search?keyword=스포맥스+WPC'},
  {name:'바디닭 BCAA 파우더 레몬맛',           brand:'바디닭',   store:'쿠팡',     o:19900,s:11900,w:'240g',  g:240, emoji:'💊',link:'https://www.coupang.com/np/search?q=바디닭+BCAA'},
  {name:'바이탈프로틴 콜라겐 펩타이드 오리지널',brand:'바이탈프로틴',store:'마켓컬리',o:45000,s:28900,w:'284g', g:284, emoji:'💊',link:'https://www.kurly.com/search?sword=바이탈프로틴+콜라겐'},
];

const drinks = [
  {name:'매일 셀렉스 마시는 단백질 초코',      brand:'매일유업', store:'이마트',   o:26400,s:17900,w:'250ml×8개',g:2000,emoji:'🥤',link:'https://emart.ssg.com/search/search.ssg?query=셀렉스+마시는+단백질'},
  {name:'매일 셀렉스 마시는 단백질 바닐라',    brand:'매일유업', store:'이마트',   o:26400,s:18200,w:'250ml×8개',g:2000,emoji:'🥤',link:'https://emart.ssg.com/search/search.ssg?query=셀렉스+마시는+단백질+바닐라'},
  {name:'바디닭 단백질 쉐이크 바닐라',          brand:'바디닭',   store:'쿠팡',     o:16800,s:10900,w:'250ml×6개',g:1500,emoji:'🥤',link:'https://www.coupang.com/np/search?q=바디닭+단백질+쉐이크+바닐라'},
  {name:'바디닭 단백질 쉐이크 초코',            brand:'바디닭',   store:'쿠팡',     o:16800,s:10500,w:'250ml×6개',g:1500,emoji:'🥤',link:'https://www.coupang.com/np/search?q=바디닭+단백질+쉐이크+초코'},
  {name:'하이뮨 마시는 단백질 오리지널 10팩',   brand:'일동후디스',store:'마켓컬리', o:24000,s:15900,w:'200ml×10개',g:2000,emoji:'🥤',link:'https://www.kurly.com/search?sword=하이뮨+마시는+단백질'},
  {name:'남양 이오 프로틴 워터 레몬',           brand:'남양유업', store:'홈플러스', o:12000,s:7800,  w:'500ml×6개',g:3000,emoji:'🥤',link:'https://www.homeplus.co.kr/search?keyword=남양+이오+프로틴'},
  {name:'오리온 닥터유 단백질 드링크 초코',     brand:'오리온',   store:'이마트',   o:14400,s:9500,  w:'190ml×8개',g:1520,emoji:'🥤',link:'https://emart.ssg.com/search/search.ssg?query=닥터유+단백질+드링크'},
  {name:'오리온 닥터유 단백질 드링크 바나나',   brand:'오리온',   store:'이마트',   o:14400,s:9800,  w:'190ml×8개',g:1520,emoji:'🥤',link:'https://emart.ssg.com/search/search.ssg?query=닥터유+단백질+드링크+바나나'},
  {name:'빅노이즈 BCAA 드링크 워터멜론',        brand:'빅노이즈', store:'올리브영', o:35400,s:23900,w:'473ml×6캔',g:2838,emoji:'🥤',link:'https://www.oliveyoung.co.kr/store/search/getSearchMain.do?query=빅노이즈+BCAA+드링크'},
  {name:'롯데 닥스 프로틴 워터 청포도',         brand:'롯데',     store:'GS25',     o:3000, s:2200,  w:'500ml',    g:500, emoji:'🥤',link:'https://www.gsshop.com/search/search.gs?keyword=닥스+프로틴+워터'},
  {name:'GS25 프로틴 밀크 초코',                brand:'GS25',     store:'GS25',     o:2800, s:1990,  w:'200ml',    g:200, emoji:'🥤',link:'https://www.gsshop.com/search/search.gs?keyword=프로틴+밀크'},
  {name:'이마트 노브랜드 프로틴 쉐이크',        brand:'이마트',   store:'이마트',   o:10900,s:6900,  w:'250ml×4개',g:1000,emoji:'🥤',link:'https://emart.ssg.com/search/search.ssg?query=노브랜드+프로틴+쉐이크'},
];

const expiries = ['2026-07-31','2026-08-31','2026-09-30','2026-10-31','2026-11-30','2026-12-31','2027-01-31','2026-06-30'];

const rows = [];

// 닭가슴살 products
let idx = 0;
brands.forEach(({brand, store, link}) => {
  const cats = Object.keys(byCategory);
  const numCats = 2 + (idx % 3);  // 2 or 3 categories per brand-store combo
  for (let c = 0; c < numCats; c++) {
    const cat = cats[(idx + c) % cats.length];
    const prods = byCategory[cat];
    const prod = prods[idx % prods.length];
    const expiry = expiries[idx % expiries.length];
    const catLink = link + (link.includes('?') ? '&cat=' : '?cat=') + encodeURIComponent(cat);
    const nm = (brand + ' ' + prod.suf).replace(/'/g, "''");
    rows.push({name:nm, brand, store, category:cat, flavor:prod.flavor, weight:prod.w, grams:prod.g, emoji:prod.emoji, o:prod.o, s:prod.s, expiry, link:catLink});
    idx++;
  }
});

// 보충제 + 음료
supple.concat(drinks).forEach((p,i) => {
  const nm = p.name.replace(/'/g,"''");
  const cat = supple.includes(p) ? '보충제' : '음료';
  const expiry = expiries[(idx+i) % expiries.length];
  rows.push({name:nm, brand:p.brand, store:p.store, category:cat, flavor:'오리지널', weight:p.w, grams:p.g, emoji:p.emoji, o:p.o, s:p.s, expiry, link:p.link});
});

// SQL 생성 (배치당 30개)
const BATCH = 30;
for (let b = 0; b * BATCH < rows.length; b++) {
  const slice = rows.slice(b * BATCH, (b+1) * BATCH);
  const sql = "INSERT INTO products (name,brand,store,category,flavor,weight,grams,emoji,original_price,sale_price,expiry_date,link) VALUES\n" +
    slice.map(r => `  ('${r.name}','${r.brand}','${r.store}','${r.category}','${r.flavor}','${r.weight}',${r.grams},'${r.emoji}',${r.o},${r.s},'${r.expiry}','${r.link}')`).join(',\n') + ';';
  const fs = require('fs');
  fs.appendFileSync('/tmp/seed_batch_' + b + '.sql', sql + '\n');
}
console.log('Total new products:', rows.length);
console.log('Batches:', Math.ceil(rows.length / BATCH));
