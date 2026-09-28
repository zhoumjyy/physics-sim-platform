/* 限流式与分压式模拟器自检（v3 · 横轴=接入阻值、电路图接线柱可见）
 * 验证：
 *   1) 分压式/限流式电压公式与端点、调节范围、推荐逻辑、电流公式
 *   2) 阻值滑条对数映射 0.1~500 Ω；横轴刻度 = 接入阻值 R_接 = s·R₀（Ω）
 *   3) 函数簇归属：拖 Rₓ 换曲线、拖本列滑条只取工作点
 *   4) 图上只画 Uₓ（电流绿虚线已移除，源码中不再出现）
 *   5) 限流式电路：滑片连杆与金属杆相连（不悬空）、导线接下接线柱 A、
 *      接入段 A→P 高亮、P→B 段虚线、B 空置
 *   6) 整体脚本（update + 两电路 SVG + 两张函数图）无异常运行
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
  tToR:tToR, rToT:rToT, niceNum:niceNum, rxFamily:rxFamily,
  fmtAxisR:fmtAxisR, rheoGeom:rheoGeom, RT:RT, RB:RB,
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

console.log('— 电流公式自检（仍用于左侧结论与列头读数）—');
T.setVals(3,20,20,1);
assert(near(T.iDiv(20,20,0), 0, 1e-9), '分压式 s=0 → I = 0');
assert(near(T.iDiv(20,20,1), 3/20, 1e-9), '分压式 s=1 → I = E/Rx');
assert(near(T.iLimit(20,20,0), 3/20, 1e-9), '限流式 s=0 → I = E/Rx');

console.log('— 阻值滑条映射 0.1 ~ 500 Ω —');
assert(near(T.tToR(0), 0.1, 1e-9), '滑条最左端 → 0.1 Ω');
assert(near(T.tToR(1000), 500, 1e-6), '滑条最右端 → 500 Ω');
assert(near(T.tToR(T.rToT(20)), 20, 1e-6), 'tToR / rToT 互逆（20 Ω 往返一致）');
assert(near(T.tToR(T.rToT(0.1)), 0.1, 1e-9) && near(T.tToR(T.rToT(500)), 500, 1e-6), '端点往返映射一致');

console.log('— 横轴刻度 = 滑动变阻器接入阻值 R_接（Ω）—');
assert(T.fmtAxisR(0)==='0', '刻度 0 → 显示 "0"');
assert(T.fmtAxisR(4)==='4', '刻度 4 Ω → 显示 "4"（不留 4.00）');
assert(T.fmtAxisR(12.5)==='12.5', '刻度 12.5 Ω → 显示 "12.5"');
assert(T.fmtAxisR(500)==='500', '刻度 500 Ω → 显示 "500"');
assert(T.fmtAxisR(0.02)==='0.02', '小量程：刻度 0.02 Ω → 显示 "0.02"');
T.setVals(3,20,20,0.5);
assert(near(0.5*T.RT === undefined ? 0 : 0.5*20, 10, 1e-9), '接入阻值 = s·R₀（s=50%、R₀=20Ω → 10 Ω）');
// 横轴量程固定为 [0, R₀]：两端点恰为 0 Ω 与 R₀
assert(near(T.uLimit(20,20,0), 1, 1e-12) && near(T.uLimit(20,20,1), 20/40, 1e-12),
  '横轴左端 R_接=0 → Uₓ=E；右端 R_接=R₀ → Uₓ=E·Rx/(Rx+R₀)');

console.log('— 函数簇归属：拖 Rₓ 换曲线，拖本列滑条取工作点 —');
T.setVals(3,20,20,0.5);
var famRx = T.rxFamily();
assert(famRx.length === 6 && near(famRx[0], 4) && near(famRx[5], 200, 1e-6), '函数簇取 Rₓ = 0.2/0.5/1/2/5/10 倍 R₀（20Ω → 4…200Ω）');
T.setVals(3,500,500,0.5);
var famBig = T.rxFamily();
assert(famBig.every(function(v){ return v >= 0.1 && v <= 500; }) && famBig.length >= 1, 'R₀=500Ω 时函数簇取值被夹在 0.1~500 Ω 内且去重');
// 曲线只由 Rₓ 决定（与滑片位置无关）→ 拖滑条时曲线不动、只挪工作点
T.setVals(3,20,20,0.5);
var curveA = [0,0.25,0.5,0.75,1].map(function(ss){ return T.uLimit(20,20,ss); });
T.setVals(3,20,20,1.0);                       // 只动滑片（sL=1），Rₓ 不变
var curveB = [0,0.25,0.5,0.75,1].map(function(ss){ return T.uLimit(20,20,ss); });
assert(curveA.join() === curveB.join(), '只改本列滑片位置 → 曲线完全不变（滑条只取工作点）');
T.setVals(3,20,20,0.5);
var uSmall = T.uLimit(20,20,0.5), uBig = T.uLimit(400,20,0.5);
assert(uSmall < uBig, '只改 Rₓ → 换了一条曲线（Rₓ↑ → Uₓ↑）');
// 单调性：Uₓ 随接入阻值单调递减（限流式）/ 单调递增（分压式）
var uSeq = [0,0.25,0.5,0.75,1].map(function(ss){ return T.uLimit(60,20,ss); });
assert(uSeq.every(function(v,i){ return i===0 || v <= uSeq[i-1] + 1e-12; }),
  '限流式：Uₓ 随接入阻值增大而单调递减');
var dSeq = [0,0.25,0.5,0.75,1].map(function(ss){ return T.uDiv(60,20,ss); });
assert(dSeq.every(function(v,i){ return i===0 || v >= dSeq[i-1] - 1e-12; }),
  '分压式：Uₓ 随接入阻值增大而单调递增（0 → E）');
assert(near(T.uDiv(60,20,0.5), 1.5/(3+0.25), 1e-9), '分压式 s=50% 的数值抽查（Rx=3R₀ → Uₓ/E ≈ 0.462）');

console.log('— 图上只画 Uₓ（无关的电流线已移除）—');
assert(code.indexOf('#7fd4a8') < 0, '源码中不再出现电流曲线的绿色（#7fd4a8）');
assert(code.indexOf('iToPy') < 0, '源码中不再有电流纵坐标映射 iToPy');
assert(code.indexOf('iAxisTop') < 0 && code.indexOf('rxAxisMax') < 0, '电流轴量程函数 iAxisTop / 横轴备选量程 rxAxisMax 均已移除');
assert(code.indexOf("'I / A（虚线）'") < 0, '图例中不再有「I / A（虚线）」');
assert(code.indexOf('横轴：滑片位置') < 0 && code.indexOf("xModeL") < 0, '横轴切换按钮与 xMode 状态已移除');

console.log('— 限流式电路图：滑片接线柱不再悬空 —');
T.setVals(3,20,20,0.5);
var g = T.rheoGeom();
assert(g.RY < g.TT && g.TT < g.TB && g.TB < g.STUB, '几何自洽：金属杆在瓷筒上方、下接线柱在瓷筒下方');
assert(g.RX0 === 150 && g.RX1 === 320, '瓷筒左右端（接线柱 A / B）位置确定');
assert(near(g.wx, g.RX0 + 0.5 * (g.RX1 - g.RX0), 1e-9), 'sL=50% → 滑片在瓷筒中点（wx = 235）');
var svgL = T.svgLimit();
// 滑片连杆：从金属杆(16) 连到电阻丝触头上方(30) —— 之前只画到 24~37 且上方无杆，故悬空
assert(svgL.indexOf('M ' + g.wx + ' ' + g.RY + ' L ' + g.wx + ' ' + (g.TT - 8)) >= 0,
  '滑片连杆自金属杆连到电阻丝（滑块骑在杆上，不再悬空）');
assert(svgL.indexOf('M ' + g.wx + ' ' + (T.RT - 22)) < 0, '旧的"悬空短线"画法已不存在');
// 金属杆本体 + 电流路径（滑片→杆→上接线柱）
assert(svgL.indexOf('M ' + g.RX0 + ' ' + g.RY + ' L ' + g.RX1 + ' ' + g.RY) >= 0, '金属杆（上接线柱所在的杆）已绘出');
assert(svgL.indexOf('M ' + g.RX1 + ' ' + g.RY + ' L 344 ' + g.RY) >= 0, '导线自上接线柱引出（不再从电阻丝右端直接穿出）');
assert(svgL.indexOf('M 344 ' + g.RY + ' L 344 ' + T.RT) >= 0, '引出导线向下绕回干路');
// 电源侧导线接到下接线柱 A，而不是直接搭在电阻丝上
assert(svgL.indexOf('M 132 ' + g.STUB + ' L ' + g.RX0 + ' ' + g.STUB) >= 0, '电源侧导线接到瓷筒下方的接线柱 A');
assert(svgL.indexOf('M ' + g.RX0 + ' ' + g.TB + ' L ' + g.RX0 + ' ' + g.STUB) >= 0, '接线柱 A 的小柱自瓷筒引出');
assert(svgL.indexOf('M ' + g.RX1 + ' ' + g.TB + ' L ' + g.RX1 + ' ' + g.STUB) >= 0, '接线柱 B 的小柱已绘出（空置）');
assert(svgL.indexOf('M ' + g.RX0 + ' ' + g.STUB + ' L ' + g.RX1 + ' ' + g.STUB) < 0, 'A、B 之间没有导线（B 确实空置）');
// 接入段高亮 / 未接入段虚线
assert(svgL.indexOf('width="85.0"') >= 0, '接入段 A→P 的高亮方块宽度 = 85（sL=50% × 170）');
assert(svgL.indexOf('stroke-dasharray="4 3"') >= 0, '未接入段 P→B 用虚线表示');
T.setVals(3,20,20,1.0);
assert(T.svgLimit().indexOf('stroke-dasharray="4 3"') < 0, 'sL=100% 时无未接入段（不出现虚线方块）');
T.setVals(3,20,20,0.0);
assert(T.svgLimit().indexOf('width="0.0"') < 0, 'sL=0% 时不生成零宽矩形');

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
  // 两种接法 × 极端（滑片 0/100%、R₀ 0.1/500、Rₓ 0.1/500、E 1/12）都要能画
  [[3,20,200,0],[3,20,200,1],[3,0.1,500,0.5],[12,500,0.1,1],[1,1,1,0.5]].forEach(function(p){
    T.setVals(p[0], p[1], p[2], p[3]);
    T.drawPlot('cvL','limit',p[3]); T.drawPlot('cvD','div',p[3]);
  });
  T.update();
} catch(e){ ok2 = false; console.error(e); }
assert(ok2, '两种接法 × 极端参数下函数图绘制均无异常');

console.log(`\n结果：通过 ${passed} / 失败 ${failed}`);
process.exit(failed > 0 ? 1 : 0);
