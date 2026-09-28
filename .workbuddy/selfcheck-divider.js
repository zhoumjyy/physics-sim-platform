/* 限流式与分压式模拟器自检（v2 · 左右两列布局）
 * 验证：分压式/限流式电压公式与端点、限流调节范围随 Rx 增大而变窄、
 *       推荐逻辑、电流公式、阻值滑条对数映射 0.1~500 Ω、线性坐标轴量程、
 *       以及整体脚本（update + 两电路 SVG + 两张函数图）无异常运行。
 */
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'simulations', '限流式与分压式.html');
const html = fs.readFileSync(file, 'utf8');
const scripts = html.match(/<script>([\s\S]*?)<\/script>/g);
if (!scripts) throw new Error('未找到 <script>');
const code = scripts.map(s => s.replace(/<\/?script>/g, '')).join('\n');

let passed = 0, failed = 0;
function assert(c, m){ if (c){ passed++; console.log('  ✓', m); } else { failed++; console.error('  ✗', m); } }
function near(a, b, t){ return Math.abs(a - b) <= (t || 1e-6); }

// ---------- 最小 DOM/canvas stub ----------
const noop = () => {};
const elements = {};
function makeElem(id){
  const ev = {};
  return {
    id, style:{}, dataset:{}, textContent:'', innerHTML:'', value:'1', checked:false,
    clientWidth:800, clientHeight:240, offsetWidth:800, offsetHeight:240, parentElement:null,
    classList:{ _s:new Set(), add(c){this._s.add(c);}, remove(c){this._s.delete(c);},
      toggle(c,on){ if(on===undefined){ on = !this._s.has(c); } on?this._s.add(c):this._s.delete(c); },
      contains(c){return this._s.has(c);} },
    addEventListener(t,f){ (ev[t]=ev[t]||[]).push(f); }, removeEventListener:noop,
    setPointerCapture:noop, releasePointerCapture:noop, getAttribute:()=>null, setAttribute:noop, dispatchEvent:noop,
    getBoundingClientRect(){ return {left:0,top:0,right:800,bottom:240,width:800,height:240,x:0,y:0}; },
    getContext(){ return ctx2d; }
  };
}
const ctx2d = new Proxy({
  canvas:{width:800,height:240},
  createImageData(w,h){ return {data:new Uint8ClampedArray(w*h*4),width:w,height:h}; },
  putImageData:noop, getImageData:noop,
  createRadialGradient:()=>({addColorStop:noop}), createLinearGradient:()=>({addColorStop:noop}),
  measureText:()=>({width:10})
}, {
  get(t,k){ if(k in t) return t[k];
    if(['strokeStyle','fillStyle','lineWidth','lineCap','lineJoin','shadowColor','shadowBlur','globalAlpha','font','textAlign','textBaseline'].indexOf(k)>=0) return '';
    if(typeof k==='string') t[k]=noop; return t[k]; },
  set(t,k,v){ t[k]=v; return true; }
});
const document = {
  getElementById(id){ return elements[id] || (elements[id]=makeElem(id)); },
  querySelectorAll(){ return []; },
  addEventListener:noop, readyState:'complete'
};
const window = { devicePixelRatio:1, addEventListener:noop, requestAnimationFrame:noop };

// ---------- 运行模拟器脚本 ----------
const testCode = `
;global.__T = {
  uLimit:uLimit, uDiv:uDiv, iLimit:iLimit, iDiv:iDiv, recType:recType,
  svgLimit:svgLimit, svgDiv:svgDiv, drawPlot:drawPlot, update:update,
  tToR:tToR, rToT:rToT, rxAxisMax:rxAxisMax, niceNum:niceNum, rxFamily:rxFamily,
  setVals:function(e,r,rx,ss){ E=e;R0=r;Rx=rx;sL=ss;sD=ss; }
};`;
try { eval(code + testCode); }
catch(e){ console.error('脚本执行异常:', e); process.exit(1); }
const T = global.__T;

console.log('— 物理公式自检 —');
assert(near(T.uDiv(100,20,0), 0, 1e-9), '分压式 s=0 → Uₓ/E = 0');
assert(near(T.uDiv(100,20,1), 1, 1e-9), '分压式 s=1 → Uₓ/E = 1');
assert(near(T.uDiv(5,20,1), 1, 1e-9), '分压式 s=1（小阻值）仍 → Uₓ/E = 1');
assert(near(T.uLimit(100,20,0), 1, 1e-9), '限流式 s=0 → Uₓ/E = 1');
assert(near(T.uLimit(100,20,1), 100/120, 1e-9), '限流式 s=1 → Uₓ/E = Rx/(Rx+R0)');
var kEx = (0.1/500)*0.5/((0.1/500)+0.5*0.5);
assert(near(T.uDiv(0.1,500,0.5), kEx, 1e-12), '分压式在极端阻值(0.1Ω / 500Ω)下公式仍成立');

console.log('— 调控范围自检 —');
assert((1 - T.uLimit(200,20,1)) < (1 - T.uLimit(20,20,1)), 'Rx≫R₀ 时限流式调节范围比 Rx≈R₀ 时更小');
assert(near(1 - T.uLimit(200,20,1), 20/220, 1e-3), 'Rx=200,R0=20 时限流调节幅度 ≈ 9.1%');
assert(near(1 - T.uLimit(20,20,1), 0.5, 1e-3), 'Rx=20,R0=20 时限流调节幅度达 50%');
assert(near(T.uDiv(200,20,1) - T.uDiv(200,20,0), 1, 1e-9), '分压式对任意 Rx 调节范围恒为 0→E');

console.log('— 推荐逻辑自检 —');
T.setVals(3,20,200,0.5); assert(T.recType()==='div',  'Rx=200,R0=20 → 推荐分压式');
T.setVals(3,20,20,0.5);  assert(T.recType()==='limit','Rx=20,R0=20 → 推荐限流式');
T.setVals(3,20,2,0.5);   assert(T.recType()==='limit','Rx=2,R0=20 → 推荐限流式');
T.setVals(3,0.1,500,0.5);assert(T.recType()==='div',  'Rx=500,R0=0.1（极端比）→ 推荐分压式');

console.log('— 电流公式自检 —');
T.setVals(3,20,20,1);
assert(near(T.iDiv(20,20,0), 0, 1e-9), '分压式 s=0 → I = 0');
assert(near(T.iDiv(20,20,1), 3/20, 1e-9), '分压式 s=1 → I = E/Rx');
assert(near(T.iLimit(20,20,0), 3/20, 1e-9), '限流式 s=0 → I = E/Rx');

console.log('— 阻值滑条映射 0.1 ~ 500 Ω —');
assert(near(T.tToR(0), 0.1, 1e-9), '滑条最左端 → 0.1 Ω');
assert(near(T.tToR(1000), 500, 1e-6), '滑条最右端 → 500 Ω');
assert(near(T.tToR(T.rToT(20)), 20, 1e-6), 'tToR / rToT 互逆（20 Ω 往返一致）');
assert(near(T.tToR(T.rToT(0.1)), 0.1, 1e-9) && near(T.tToR(T.rToT(500)), 500, 1e-6), '端点往返映射一致');

console.log('— 线性坐标轴量程 —');
T.setVals(3,20,20,0.5); assert(T.rxAxisMax()===50, 'Rx=20,R0=20 → 横轴上限取 50 Ω');
T.setVals(3,20,200,0.5);assert(T.rxAxisMax()===300,'Rx=200（> 量程档 200）→ 横轴上限自动升到 300 Ω');
T.setVals(3,500,500,0.5);assert(T.rxAxisMax()===500,'极端值 500 Ω 仍在量程内');
assert(T.niceNum(0.017)===0.02, '电流轴自动量程向上取整（0.017 → 0.02）');

console.log('— 函数簇与滑条归属（本次修正的核心）—');
T.setVals(3,20,20,0.5);
var famRx = T.rxFamily();
assert(famRx.length === 6 && near(famRx[0], 4) && near(famRx[5], 200, 1e-6), '横轴=滑片位置时，函数簇取 Rₓ = 0.2/0.5/1/2/5/10 倍 R₀（20Ω → 4…200Ω）');
T.setVals(3,500,500,0.5);
var famBig = T.rxFamily();
assert(famBig.every(function(v){ return v >= 0.1 && v <= 500; }) && famBig.length >= 1, 'R₀=500Ω 时函数簇取值被夹在 0.1~500 Ω 内且去重');

// 横轴=滑片位置（默认）：曲线由 Rₓ 决定 → 改 Rₓ 换曲线
T.setVals(3,20,20,0.5);
var uS_small = T.uLimit(20,20,0.5), uS_big = T.uLimit(400,20,0.5);
assert(uS_small < uS_big, '限流式：横轴=滑片位置时，不同 Rₓ 对应不同曲线（Rₓ↑ → Uₓ↑）');
// 滑片位置作为自变量：限流式递减、分压式递增
var uSeq = [0,0.25,0.5,0.75,1].map(function(ss){ return T.uLimit(60,20,ss); });
var monoDown = uSeq.every(function(v,i){ return i===0 || v <= uSeq[i-1] + 1e-12; });
assert(monoDown, '限流式：Uₓ 随滑片位置单调递减（滑片接入越多，分压越小）');
var dSeq = [0,0.25,0.5,0.75,1].map(function(ss){ return T.uDiv(60,20,ss); });
var monoUp = dSeq.every(function(v,i){ return i===0 || v >= dSeq[i-1] - 1e-12; });
assert(monoUp, '分压式：Uₓ 随滑片位置单调递增（0 → E）');
assert(near(T.uDiv(60,20,0.5), 1.5/(3+0.25), 1e-9), '分压式 s=50% 的数值抽查（Rx=3R₀ → Uₓ/E ≈ 0.462）');
// 横轴=待测电阻（备选模式）：曲线由滑片位置决定
var uR = [0.3,0.9].map(function(ss){ return T.uLimit(20,20,ss); });
assert(uR[0] !== uR[1], '切到「横轴=Rₓ」后，曲线改由滑片位置决定（s=30% 与 90% 曲线不同）');

console.log('— 渲染自检 —');
let ok = true;
try {
  T.setVals(3,20,20,0.5);
  T.update();
  const a = T.svgLimit(), b = T.svgDiv();
  if (!a || !b || a.length < 50 || b.length < 50) ok = false;
} catch(e){ ok = false; console.error(e); }
assert(ok, 'update() 与两电路 SVG 生成均无异常');

let ok2 = true;
try {
  // 四种组合（两种接法 × 两种横轴）以及极端滑片位置都要能画
  T.setVals(3,20,200,0);   T.drawPlot('cvL','limit',0,'rx'); T.drawPlot('cvD','div',0,'rx');
  T.setVals(3,20,200,0);   T.drawPlot('cvL','limit',0,'s');  T.drawPlot('cvD','div',0,'s');
  T.setVals(3,0.1,500,1);  T.drawPlot('cvL','limit',1,'rx'); T.drawPlot('cvD','div',1,'rx');
  T.setVals(12,500,0.1,1); T.drawPlot('cvL','limit',1,'s');  T.drawPlot('cvD','div',1,'s');
  T.update();
} catch(e){ ok2 = false; console.error(e); }
assert(ok2, '两种接法 × 两种横轴 × 极端参数下函数图绘制均无异常');

console.log(`\n结果：通过 ${passed} / 失败 ${failed}`);
process.exit(failed > 0 ? 1 : 0);
