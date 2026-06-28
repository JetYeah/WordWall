/**
 * 叠嶂（错落立方体堆）—— WebView 跑的 three.js 真 3D 场景 HTML 载荷。
 *
 * 形态：N×N×N 立方体块，小立方体严丝合缝对齐，按密度随机缺一些（错落），
 * 但每条轴列保底 ≥1 块 → 6 个面投影过去始终是完整字墙（每格由「该方向最前方的存在块」露字）。
 * 透视相机、360° 自由旋转、松手吸附到最近 6 面之一；吸附后逐块摊平成一面平墙（顶点动画）。
 *
 * 为什么 WebView+three.js：RN 无 preserve-3d/translateZ、CJK 在矩阵变换下会糊；WebView 的 WebGL
 * 原生 3D、CJK 用 CanvasTexture 清晰。详见 CLAUDE.md「叠嶂」节与 voxel-pile-preview.html（设计原型）。
 *
 * 性能：所有小立方体合并成单个 BufferGeometry（1 draw call）；摊平用顶点动画（每帧重算各块顶点），
 * 不用「每块一个 mesh」（N=12 时 ~700 mesh 在移动端扛不住）。
 *
 * 桥接（WebView→RN，仅离散事件）：
 *   - {type:'flat', face}  吸附+摊平落定 → RN 淡入该面的 2D 字墙 + 解密卡解题
 * RN→WebView：
 *   - window.__unflatten()  返回旋转（RN 淡回 3D 堆时调用，顶点动画还原 + 镜头拉远）
 *
 * 纯函数（无 React/native），输入 6 面 N×N 字墙 + 几何 + 颜色，输出自包含 HTML。
 */
import type { CellStyleEntry } from '../components/TextGrid';

export interface VoxelColors {
  wallBg: string;
  wallText: string;
  stageBg: string;
  accent: string;
}

export interface VoxelHtmlOptions {
  /** 6 面 N×N 字墙；grids[solutionFace] = layout.grid（盖印正解），其余填充 */
  grids: string[][][];
  /** 边长（格）；block = N×N×N */
  n: number;
  /** 单格 CSS 像素（== RN cellSize） */
  cell: number;
  /** 起始正面索引（≠ solutionFace，强制开局搜索） */
  startFace: number;
  /** 正解面索引（仅用于面指示器高亮） */
  solutionFace: number;
  /** 缺块率（去掉的比例；0.2 = 缺 20%、留 80%） */
  dens: number;
  /** 共享逐格样式矩阵（buildCellStyles(layout.grid)），位置噪声与面无关 */
  styles: CellStyleEntry[][];
  colors: VoxelColors;
}

function escapeHtml(ch: string): string {
  return ch.replace(/[&<>"']/g, (s) =>
    s === '&' ? '&amp;' : s === '<' ? '&lt;' : s === '>' ? '&gt;' : s === '"' ? '&quot;' : '&#39;',
  );
}

export function buildVoxelHtml(o: VoxelHtmlOptions): string {
  const N = o.n;
  const CELL = o.cell;
  const HALF = (N * CELL) / 2;
  // 把 6 面字墙 + 样式序列化进 HTML（JS 里直接取用）
  const gridsJson = JSON.stringify(o.grids);
  const stylesJson = JSON.stringify(
    o.styles.map((row) => row.map((s) => ({ fs: s.fontSize, c: s.color, o: s.opacity, r: s.transform?.[0]?.rotate ?? '0deg' }))),
  );

  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover" />
<style>
  *{box-sizing:border-box;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}
  html,body{margin:0;padding:0;width:100%;height:100%;background:${o.colors.stageBg};overflow:hidden;touch-action:none;overscroll-behavior:none;}
  body{font-family:"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif;}
  #err{position:fixed;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;color:${o.colors.wallText};text-align:center;padding:24px;z-index:9;}
  #err h2{color:#FF6B6B;margin:0 0 8px;font-size:16px;} #err p{color:#8a7a55;font-size:12px;margin:4px 0;}
  #err button{margin-top:14px;padding:10px 22px;border:1px solid ${o.colors.accent};background:transparent;color:${o.colors.accent};border-radius:10px;font-size:14px;}
  #ld{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#8a7a55;font-size:13px;letter-spacing:2px;z-index:8;}
</style>
</head>
<body>
<div id="ld">正在加载 3D 资源…</div>
<div id="err"><h2>3D 资源加载失败</h2><p>three.js CDN 不可达，请检查网络后重试。</p><button onclick="location.reload()">重试</button></div>
<script>
function loadThree(ok,err){var u=['https://cdn.bootcdn.net/ajax/libs/three.js/r128/three.min.js','https://cdn.staticfile.org/three.js/r128/three.min.js','https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'];var i=0;(function t(){if(i>=u.length){err();return;}var s=document.createElement('script');s.src=u[i++];s.onload=ok;s.onerror=t;document.head.appendChild(s);})();}
var N=${N},CELL=${CELL},HALF=${HALF},DENS=${o.dens},STARTFACE=${o.startFace},SOLFACE=${o.solutionFace};
var GRIDS=${gridsJson},STYLES=${stylesJson};
var COL={wallBg:'${o.colors.wallBg}',wallText:'${o.colors.wallText}'};
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function pickFiller(rng){var f='天地人和风雨山水花鸟鱼虫日月星辰春夏秋冬金木火土心性情意道法自然命运生死爱恨喜怒哀乐福禄寿喜财光明暗影黑白红黄蓝绿大小高低远近深浅快慢强弱新旧美善德信忠孝礼义廉耻勇智仁慧思学问道术器用功夫力能力行止进退取舍成败得失有无虚实动静山川湖海江河溪泉峰谷岩崖松竹梅兰菊荷桃柳';return f[(rng()*f.length)|0];}
loadThree(init,function(){document.getElementById('ld').style.display='none';document.getElementById('err').style.display='flex';});

function init(){
  document.getElementById('ld').style.display='none';
  var W=window.innerWidth,H=window.innerHeight;
  var renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.setSize(W,H);renderer.setClearColor(0x1A1612,1);
  document.body.appendChild(renderer.domElement);
  var scene=new THREE.Scene();
  var NB=N*CELL,TAN22=Math.tan(22.5*Math.PI/180);
  var CAM_FAR=HALF+NB*H/(2*TAN22*W); // 入场/旋转：正面铺满屏宽（正方形墙）
  var cam=new THREE.PerspectiveCamera(45,W/H,1,8000);cam.position.set(0,0,CAM_FAR);cam.lookAt(0,0,0);

  // 字图集：6 面所有字 + 填充字 → 一张 canvas，每字一 cell
  var charSet={};
  GRIDS.forEach(function(g){g.forEach(function(row){row.forEach(function(ch){charSet[ch]=1;});});});
  for(var i=0;i<200;i++) charSet[pickFiller(mulberry32(999+i))]=1;
  var chars=Object.keys(charSet),AC=16,AR=Math.ceil(chars.length/AC),CA=96;
  var cv=document.createElement('canvas');cv.width=AC*CA;cv.height=AR*CA;
  var ctx=cv.getContext('2d');ctx.fillStyle=COL.wallBg;ctx.fillRect(0,0,cv.width,cv.height);
  ctx.font='bold 64px "PingFang SC","Microsoft YaHei",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=COL.wallText;
  var amap={};
  chars.forEach(function(ch,idx){var ax=idx%AC,ay=(idx/AC)|0;ctx.fillText(ch,ax*CA+CA/2,ay*CA+CA/2);amap[ch]={u0:ax/AC,u1:(ax+1)/AC,v0:1-(ay+1)/AR,v1:1-ay/AR};});
  var tex=new THREE.CanvasTexture(cv);tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearMipmapLinearFilter;tex.anisotropy=renderer.capabilities.getMaxAnisotropy();tex.needsUpdate=true;
  var mat=new THREE.MeshBasicMaterial({map:tex});

  function F(dir,y,x){var g=GRIDS[dir];return(g&&g[y]&&g[y][x])?g[y][x]:pickFiller(mulberry32(dir*1000+y*100+x));}

  // 严丝合缝网格 + 随机缺块（DENS=缺块率）+ 三轴保底 ≥1（6 面投影始终完整）
  var rng=mulberry32(20260622);
  var present=[];for(var z=0;z<N;z++){present[z]=[];for(var y=0;y<N;y++){present[z][y]=[];for(var x=0;x<N;x++)present[z][y][x]=rng()>=DENS;}}
  for(var y=0;y<N;y++)for(var x=0;x<N;x++){var a=false;for(var zz=0;zz<N;zz++)if(present[zz][y][x])a=true;if(!a)present[N-1][y][x]=true;}
  for(var y=0;y<N;y++)for(var z=0;z<N;z++){var a=false;for(var xx=0;xx<N;xx++)if(present[z][y][xx])a=true;if(!a)present[z][y][N-1]=true;}
  for(var x=0;x<N;x++)for(var z=0;z<N;z++){var a=false;for(var yy=0;yy<N;yy++)if(present[z][yy][x])a=true;if(!a)present[z][0][x]=true;}

  // 索引表 + 每面最前块朝外面字
  var idxOf={},cidx=0;
  for(var z=0;z<N;z++)for(var y=0;y<N;y++)for(var x=0;x<N;x++)if(present[z][y][x]){idxOf[x+','+y+','+z]=cidx;cidx++;}
  var frontOf=[{},{},{},{},{},{}], cubeChars={};
  var FACEBOX=[4,5,0,1,2,3]; // dir→BoxGeometry 面序 front4 back5 right0 left1 top2 bottom3
  function setFm(dir){
    if(dir===0){for(var y=0;y<N;y++)for(var x=0;x<N;x++){for(var z=N-1;z>=0;z--)if(present[z][y][x]){var id=idxOf[x+','+y+','+z];if(!cubeChars[id])cubeChars[id]={};cubeChars[id][FACEBOX[dir]]=F(dir,y,x);frontOf[dir][id]=true;break;}}}
    else if(dir===1){for(var y=0;y<N;y++)for(var x=0;x<N;x++){for(var z=0;z<N;z++)if(present[z][y][x]){var id=idxOf[x+','+y+','+z];if(!cubeChars[id])cubeChars[id]={};cubeChars[id][FACEBOX[dir]]=F(dir,y,x);frontOf[dir][id]=true;break;}}}
    else if(dir===2){for(var y=0;y<N;y++)for(var z=0;z<N;z++){for(var x=N-1;x>=0;x--)if(present[z][y][x]){var id=idxOf[x+','+y+','+z];if(!cubeChars[id])cubeChars[id]={};cubeChars[id][FACEBOX[dir]]=F(dir,y,z);frontOf[dir][id]=true;break;}}}
    else if(dir===3){for(var y=0;y<N;y++)for(var z=0;z<N;z++){for(var x=0;x<N;x++)if(present[z][y][x]){var id=idxOf[x+','+y+','+z];if(!cubeChars[id])cubeChars[id]={};cubeChars[id][FACEBOX[dir]]=F(dir,y,z);frontOf[dir][id]=true;break;}}}
    else if(dir===4){for(var x=0;x<N;x++)for(var z=0;z<N;z++){for(var y=0;y<N;y++)if(present[z][y][x]){var id=idxOf[x+','+y+','+z];if(!cubeChars[id])cubeChars[id]={};cubeChars[id][FACEBOX[dir]]=F(dir,z,x);frontOf[dir][id]=true;break;}}}
    else{for(var x=0;x<N;x++)for(var z=0;z<N;z++){for(var y=N-1;y>=0;y--)if(present[z][y][x]){var id=idxOf[x+','+y+','+z];if(!cubeChars[id])cubeChars[id]={};cubeChars[id][FACEBOX[dir]]=F(dir,z,x);frontOf[dir][id]=true;break;}}}
  }
  for(var d=0;d<6;d++) setFm(d);

  // 逐格样式（位置噪声），从 STYLES 取
  function styleOf(y,x){var s=STYLES[y]&&STYLES[y][x];return s||{fs:CELL-6,c:COL.wallText,o:1,r:'0deg'};}

  // 合并几何：每个 cube 一个 BoxGeometry（UV 指向图集对应字），记录顶点区间 + 中心，便于摊平动画
  var s=CELL*0.94, geos=[], cubes=[];
  for(var z=0;z<N;z++)for(var y=0;y<N;y++)for(var x=0;x<N;x++){
    if(!present[z][y][x])continue;
    var id=idxOf[x+','+y+','+z], cc=cubeChars[id]||{};
    var chars6=[cc[0]||pickFiller(rng),cc[1]||pickFiller(rng),cc[2]||pickFiller(rng),cc[3]||pickFiller(rng),cc[4]||pickFiller(rng),cc[5]||pickFiller(rng)];
    var g=new THREE.BoxGeometry(s,s,s), uv=g.attributes.uv;
    for(var f=0;f<6;f++){var r=amap[chars6[f]]||amap[Object.keys(amap)[0]],b=f*4;uv.setXY(b+0,r.u0,r.v1);uv.setXY(b+1,r.u1,r.v1);uv.setXY(b+2,r.u0,r.v0);uv.setXY(b+3,r.u1,r.v0);}
    uv.needsUpdate=true; g.translate(-HALF+x*CELL+CELL/2, HALF-y*CELL-CELL/2, -HALF+z*CELL+CELL/2);
    cubes.push({center:new THREE.Vector3(-HALF+x*CELL+CELL/2, HALF-y*CELL-CELL/2, -HALF+z*CELL+CELL/2)});
    geos.push(g);
  }
  // 合并（先 toNonIndexed 展开，否则索引丢失 → 三角形乱连）
  var pos=[],nor=[],uv2=[],vc=0;
  geos.forEach(function(g){var gg=g.index?g.toNonIndexed():g;var p=gg.attributes.position,n=gg.attributes.normal,u=gg.attributes.uv;cubes[vc].start=pos.length/3;cubes[vc].count=p.count;for(var i=0;i<p.count;i++){pos.push(p.getX(i),p.getY(i),p.getZ(i));nor.push(n.getX(i),n.getY(i),n.getZ(i));uv2.push(u.getX(i),u.getY(i));}vc++;});
  var geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv2,2));
  var basePos=geo.attributes.position.array.slice(); // 原始顶点（摊平动画基准）
  var pile=new THREE.Mesh(geo,mat);
  var group=new THREE.Group();group.add(pile);scene.add(group);

  function eq(x,y,z){var q=new THREE.Quaternion();q.setFromEuler(new THREE.Euler(x,y,z,'XYZ'));return q;}
  var TARGETS=[eq(0,0,0),eq(0,Math.PI,0),eq(0,-Math.PI/2,0),eq(0,Math.PI/2,0),eq(Math.PI/2,0,0),eq(-Math.PI/2,0,0)];
  var FNORM=[[0,0,1],[0,0,-1],[1,0,0],[-1,0,0],[0,1,0],[0,-1,0]],_nv=new THREE.Vector3();
  function nearestFace(q){var bd=-2,best=0;for(var i=0;i<6;i++){_nv.fromArray(FNORM[i]).applyQuaternion(q);if(_nv.z>bd){bd=_nv.z;best=i;}}return best;}
  var FLAT_AXIS=[2,2,0,0,1,1], FLAT_PLANE=[HALF,-HALF,HALF,-HALF,HALF,-HALF];
  group.quaternion.copy(TARGETS[STARTFACE]);

  // 桥接
  function post(msg){try{if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(msg));}catch(e){}}
  var mode='rotate', anim=null; // anim: {phase:'rot'|'flat'|'unflat',...}
  function snapTo(face){ mode='busy'; anim={phase:'rot',from:group.quaternion.clone(),to:TARGETS[face],t0:performance.now(),dur:280,face:face}; }
  function startFlat(face){
    cubes.forEach(function(c,i){ var onWall=frontOf[face][i]; c.flatTx=new THREE.Vector3();
      if(onWall){var ax=FLAT_AXIS[face];c.flatTx.setComponent(ax,FLAT_PLANE[face]-c.center.getComponent(ax));} c.flatScale=onWall?1:0; });
    anim={phase:'flat',t0:performance.now(),dur:460,face:face,camFrom:cam.position.z,camTo:cam.position.z}; // 摊平只动立方体（正面已铺满屏宽 ≈ 2D 墙尺寸，不缩放）
  }
  window.__unflatten=function(){ if(mode!=='flat')return; mode='busy'; anim={phase:'unflat',t0:performance.now(),dur:380,camFrom:cam.position.z,camTo:CAM_FAR}; };

  // 顶点动画：每块 local 顶点按 scale 缩、按 tx 平移（basePos 为基准）
  function applyFlat(e){
    var arr=geo.attributes.position.array;
    for(var i=0;i<cubes.length;i++){var c=cubes[i],sc=1+(c.flatScale-1)*e,tx=c.flatTx.x*e,ty=c.flatTx.y*e,tz=c.flatTx.z*e;
      var cx=c.center.x,cy=c.center.y,cz=c.center.z;
      for(var v=c.start;v<c.start+c.count;v++){var b=v*3;var lx=basePos[b]-cx,ly=basePos[b+1]-cy,lz=basePos[b+2]-cz;arr[b]=cx+lx*sc+tx;arr[b+1]=cy+ly*sc+ty;arr[b+2]=cz+lz*sc+tz;}
    }
    geo.attributes.position.needsUpdate=true;
  }

  var dragging=false,sx=0,sy=0,basX=0,basY=0;
  function down(x,y){if(mode!=='rotate')return;dragging=true;sx=x;sy=y;var e=new THREE.Euler().setFromQuaternion(group.quaternion,'YXZ');basX=e.y;basY=e.x;}
  function move(x,y){if(!dragging)return;group.quaternion.setFromEuler(new THREE.Euler(basY-(y-sy)*0.01,basX+(x-sx)*0.01,0,'YXZ'));}
  function up(){if(!dragging)return;dragging=false;snapTo(nearestFace(group.quaternion));}
  renderer.domElement.addEventListener('pointerdown',function(e){renderer.domElement.setPointerCapture(e.pointerId);down(e.clientX,e.clientY);});
  window.addEventListener('pointermove',function(e){if(dragging)move(e.clientX,e.clientY);});
  window.addEventListener('pointerup',function(){if(dragging)up();});
  window.addEventListener('pointercancel',function(){if(dragging){dragging=false;snapTo(nearestFace(group.quaternion));}});

  function ease(t){return t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2;}
  function loop(){
    requestAnimationFrame(loop);
    if(anim){var t=Math.min(1,(performance.now()-anim.t0)/anim.dur),e=ease(t);
      if(anim.phase==='rot'){group.quaternion.slerpQuaternions(anim.from,anim.to,e);if(t>=1)startFlat(anim.face);}
      else if(anim.phase==='flat'){cam.position.z=anim.camFrom+(anim.camTo-anim.camFrom)*e;applyFlat(e);if(t>=1){var ff=anim.face;mode='flat';anim=null;post({type:'flat',face:ff});}}
      else if(anim.phase==='unflat'){cam.position.z=anim.camFrom+(anim.camTo-anim.camFrom)*e;applyFlat(1-e);if(t>=1){mode='rotate';anim=null;}}
    }
    renderer.render(scene,cam);
  }
  loop();
  window.addEventListener('resize',function(){W=window.innerWidth;H=window.innerHeight;cam.aspect=W/H;cam.updateProjectionMatrix();renderer.setSize(W,H);});
}
</script>
</body>
</html>`;
}
