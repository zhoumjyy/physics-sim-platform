/* 限流式与分压式模拟器自检
 * 验证：分压式/限流式电压公式与端点、限流调节范围随 Rx 增大而变窄、
 *       推荐逻辑、电流公式，以及脚本整体（update + 两电路 SVG）无异常运行。
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
    clientWidth:800, clientHeight:226, offsetWidth:800, offsetHeight:226, parentElement:null,
    classList:{ _s:new Set(), add(c){this._s.add(c);}, remove(c){this._s.delete(c);}, toggle(c,on){ on?this._s.add(c):this._s.delete(c);}, contains(c){return this._s.has(c);} },
    addEventListener(t,f){ (ev[t]=ev[t]||[]).push(f); }, removeEventListener:noop,
    setPointerCapture:noop, releasePointerCapture:noop, getAttribute:()=>null, setAttribute:noop, dispatchEvent:noop,
    getBoundingClientRect(){ return {left:0,top:0,right:800,bottom:226,width:800,height:226,x:0,y:0}; },
    getContext(){ return ctx2d; }
  };
}
const ctx2d = new Proxy({
  canvas:{width:800,height:226},
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
  addEventListener:noop, readyState:'complete'
};
const window = { devicePixelRatio:1, addEventListener:noop, requestAnimationFrame:noop };

// ---------- 运行模拟器脚本（同作用域以便断言内部函数） ----------
const testCode = `
;global.__T = {
  uLimit:uLimit, uDiv:uDiv, iLimit:iLimit, iDiv:iDiv, recType:recType,
  svgLimit:svgLimit, svgDiv:svgDiv, update:update,
  setVals:function(e,r,rx,ss){ E=e;R0=r;Rx=rx;s=ss; }
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

const kBig = 1 - T.uLimit(200,20,1);
const kSmall = 1 - T.uLimit(20,20,1);
assert(kBig < kSmall, 'Rx≫R₀ 时限流式调节范围(1−下限) 比 Rx≈R₀ 时更小');
assert(near(1 - T.uLimit(200,20,1), 20/220, 1e-3), 'Rx=200,R0=20 时限流下限偏离 ≈ 9.1%');
assert(near(1 - T.uLimit(20,20,1), 0.5, 1e-3), 'Rx=20,R0=20 时限流调节范围达 50%');
assert(near(T.uDiv(200,20,1) - T.uDiv(200,20,0), 1, 1e-9), '分压式对任意 Rx 调节范围恒为全量程 0→E');

T.setVals(3,20,200,0.5); assert(T.recType()==='div',  'Rx=200,R0=20 → 推荐分压式');
T.setVals(3,20,20,0.5);  assert(T.recType()==='limit','Rx=20,R0=20 → 推荐限流式');
T.setVals(3,20,2,0.5);   assert(T.recType()==='limit','Rx=2,R0=20 → 推荐限流式');

T.setVals(3,20,20,1);
assert(near(T.iDiv(20,20,0), 0, 1e-9), '分压式 s=0 → I = 0');
assert(near(T.iDiv(20,20,1), 3/20, 1e-9), '分压式 s=1 → I = E/Rx');

let ok = true;
try {
  T.update();
  const a = T.svgLimit(), b = T.svgDiv();
  if (!a || !b || a.length < 50 || b.length < 50) ok = false;
} catch(e){ ok = false; console.error(e); }
assert(ok, 'update() 与两电路 SVG 生成均无异常');

console.log(`\n结果：通过 ${passed} / 失败 ${failed}`);
process.exit(failed > 0 ? 1 : 0);
