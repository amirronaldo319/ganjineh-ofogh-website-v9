import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { makeDetailer } from './details.js';
import { createWalk } from './walk.js';
import { createLighting } from './lighting.js';
import { plans as sourcePlans } from './plans.js';

// V9: apartments 1–4 as numbered in the v25 brochure. The model data keeps its original order
// (0 long, 1 L-shaped, 2 compact, 3 tall); layout shape is how each was matched to a numbered apartment.
const plans=[sourcePlans[0],sourcePlans[1],sourcePlans[3],sourcePlans[2]];

const $=id=>document.getElementById(id);
let renderer,scene,camera,orbit,model,walls,furnishings,roomMeshes=[],labels=[],active=0,view='3d',selected=null,flight=null,ready=false;
// dirty counts frames still owed a render; the loop otherwise idles so a still model costs almost nothing.
let hemi,lighting,walk,wallMeshes=[],savedWalls='40',walkRoom=-1,lastFrame=performance.now(),dirty=2;
let centre=new THREE.Vector3(),span=18;
let wallCaps=[],wallMaterials=[];
const cutPlane=new THREE.Plane(new THREE.Vector3(0,-1,0),1.06);
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const TYPES=['1','2','3','4'];
// Areas as supplied in the v25 brochure; the model geometry itself is illustrative.
const AREAS=['143.25','150','166','162'];
// Plan data keeps its English room keys; these are the Persian display names.
const ROOM_FA={'Primary bedroom':'اتاق خواب اصلی','Twin bedroom':'اتاق خواب دو تخته','Study':'اتاق خواب سوم','En suite':'حمام اتاق اصلی','Bathroom':'حمام','Guest WC':'سرویس مهمان','Kitchen':'آشپزخانه','Service kitchen':'آشپزخانه جانبی','Living room':'پذیرایی','Lounge':'نشیمن','Dining':'ناهارخوری','Entrance':'ورودی','Balcony':'بالکن'};
const roomName=name=>ROOM_FA[name]||name;
const fa=n=>String(n).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
function updateCounts(i){const names=plans[i].rooms.map(r=>r.name);const beds=names.filter(n=>/bedroom/i.test(n)).length,study=names.includes('Study'),baths=names.filter(n=>['En suite','Bathroom','Guest WC'].includes(n)).length;// The study is the unit's third bedroom (confirmed by the project team); the model furnishes it as a study.
$('room-count').textContent=fa(beds+(study?1:0))+' اتاق خواب';$('bath-count').textContent=fa(baths)+' سرویس بهداشتی';}
const nav=$('plans');
plans.forEach((p,i)=>{
 const type=TYPES[i];const b=document.createElement('button');b.className='plancard'+(i===0?' active':'');b.setAttribute('aria-pressed',i===0?'true':'false');b.innerHTML=`<img class="planthumb" src="${p.image}" alt=""><span class="cardtext"><span class="planid" lang="en">APARTMENT ${type}</span><strong>واحد ${fa(type)}</strong><small>${fa(AREAS[i]).replace('.','٫')} متر مربع</small></span>`;b.onclick=()=>selectPlan(i);nav.append(b);
});

function texture(kind){
 const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d');let seed=913;
 const rand=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
 if(kind==='wood'){
  ctx.fillStyle='#5b412f';ctx.fillRect(0,0,512,512);
  for(let j=0;j<8;j++){let r=88+Math.floor(rand()*26),g=r*.72,b=r*.52;ctx.fillStyle=`rgb(${r},${g},${b})`;ctx.fillRect(j*64,0,64,512);
   for(let k=0;k<90;k++){let x=j*64+rand()*64;ctx.strokeStyle=`rgba(37,22,11,${rand()*.13})`;ctx.lineWidth=.3+rand();ctx.beginPath();ctx.moveTo(x,0);ctx.bezierCurveTo(x+rand()*4,170,x-rand()*4,340,x,512);ctx.stroke();}
   ctx.fillStyle='#2c211344';ctx.fillRect(j*64,0,1,512);let joint=(j%3)*160+30;ctx.fillRect(j*64,joint,64,1);
  }
 }else if(kind==='marble'){
  ctx.fillStyle='#ece4d6';ctx.fillRect(0,0,512,512);
  for(let i=0;i<35;i++){ctx.strokeStyle=`rgba(140,118,92,${.03+rand()*.06})`;ctx.lineWidth=.3+rand()*1.4;ctx.beginPath();const x=rand()*650-100;ctx.moveTo(x,-30);ctx.bezierCurveTo(x+80,120,x-70,310,x+140,540);ctx.stroke();}
 }else if(kind==='rug'){
  ctx.fillStyle='#b9b09b';ctx.fillRect(0,0,512,512);for(let i=0;i<9000;i++){let q=rand()>.5?255:30;ctx.fillStyle=`rgba(${q},${q},${q},.075)`;ctx.fillRect(rand()*512,rand()*512,1,3);}
 }else{
  ctx.fillStyle='#535b5d';ctx.fillRect(0,0,512,512);ctx.strokeStyle='#84918f';ctx.lineWidth=1;for(let x=0;x<=512;x+=128){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,512);ctx.moveTo(0,x);ctx.lineTo(512,x);ctx.stroke();}
  for(let i=0;i<22;i++){ctx.strokeStyle='#c8d0cd18';ctx.beginPath();let x=rand()*512,y=rand()*512;ctx.moveTo(x,y);ctx.bezierCurveTo(x+60,y+15,x-40,y+120,x+110,y+170);ctx.stroke();}
 }
 const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
}
const woodTex=texture('wood');woodTex.repeat.set(.6,.6);
const rugTex=texture('rug');rugTex.repeat.set(2,2);
const tileTex=texture('tile');
const mat=(color,roughness=.8,other={})=>new THREE.MeshStandardMaterial({color,roughness,...other});
// Palette tuned to the project's interior renders: warm ivory walls, walnut, travertine, bronze and olive velvet.
// Standard (not Physical) material: sheen roughly doubles shader cost, which hurts low-end phones.
const velvet=color=>mat(color,.9);
const M={wall:mat('#eee8dd',.92),wallTop:mat('#faf6ee'),base:mat('#a39b8b'),floor:mat('#ffffff',.62,{map:woodTex}),wood:mat('#6b4a33',.55),darkWood:mat('#3a2b20',.5),fabric:mat('#dcd3c3',.95),linen:mat('#f7f3ea',1),blanket:mat('#a8ab93',1),pillow:mat('#c9c2ad',1),stone:mat('#ece5d8',.28),metal:mat('#2f3531',.38,{metalness:.5}),gold:mat('#a78558',.32,{metalness:.75}),glass:mat('#b4d1d0',.1,{transparent:true,opacity:.26,depthWrite:false,metalness:.1}),tile:mat('#ffffff',.5,{map:tileTex}),porcelain:mat('#fafaf6',.22),rug:mat('#ffffff',1,{map:rugTex}),leaf:mat('#3f5b3e'),pot:mat('#cfc6b6'),black:mat('#1b2224',.25),water:mat('#728f94',.16),velvet:velvet('#5d6645'),cabinet:mat('#e6dfd2',.55)};
const marbleTex=texture('marble');
M.stone.map=marbleTex;M.stone.roughness=.3;
M.floor.bumpMap=woodTex;M.floor.bumpScale=.018;
M.fabric.bumpMap=rugTex;M.fabric.bumpScale=.018;
M.linen.bumpMap=rugTex;M.linen.bumpScale=.01;
M.tile.bumpMap=tileTex;M.tile.bumpScale=.015;
const detailItem=makeDetailer(THREE,M,{box,cyl,sphere,group});
function mesh(geo,material,parent,x=0,y=0,z=0){const m=new THREE.Mesh(geo,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function box(parent,x,y,z,w,h,d,material,round=0){return mesh(round?new RoundedBoxGeometry(w,h,d,2,Math.min(round,w/3,h/3,d/3)):new THREE.BoxGeometry(w,h,d),material,parent,x,y,z);}
function cyl(parent,x,y,z,r,h,material,r2=r){return mesh(new THREE.CylinderGeometry(r,r2,h,20),material,parent,x,y,z);}
function sphere(parent,x,y,z,rx,ry,rz,material){const m=mesh(new THREE.SphereGeometry(1,12,8),material,parent,x,y,z);m.scale.set(rx,ry,rz);return m;}
function group(parent,x,z,angle=0){const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=angle;parent.add(g);return g;}
function rug(g,w,d,x=0,z=0){box(g,x,.025,z,w,.035,d,M.rug,.04);}
function legs(g,x,z,w,d,height=.5){for(const a of [-1,1])for(const b of [-1,1])cyl(g,x+a*w/2,height/2,z+b*d/2,.025,height,M.wood);}
function plant(g,x,z,scale=1){const p=group(g,x,z);p.scale.setScalar(scale);cyl(p,0,.23,0,.21,.45,M.pot,.15);for(let i=0;i<8;i++){let a=i*Math.PI/4;cyl(p,Math.cos(a)*.045,.57,Math.sin(a)*.045,.012,.6,M.leaf);let leaf=sphere(p,Math.cos(a)*.2,.73+(i%3)*.13,Math.sin(a)*.2,.16,.26,.07,M.leaf);leaf.rotation.set(.4,a,.6);}return p;}
function chair(g,x,z,angle=0){const c=group(g,x,z,angle);legs(c,0,0,.35,.36,.44);box(c,0,.47,0,.49,.13,.49,M.velvet,.06);box(c,0,.75,-.21,.47,.52,.08,M.velvet,.06);return c;}
function coffee(g,x,z,w=1.1,d=.65){legs(g,x,z,w*.7,d*.7,.32);box(g,x,.35,z,w,.09,d,M.stone,.05);cyl(g,x+.2,.45,z,.07,.14,M.pot);sphere(g,x+.2,.58,z,.14,.13,.12,M.leaf);box(g,x-.25,.41,z,.28,.025,.2,M.blanket);}
function sofa(g,x,z,w=2.3,angle=0){const s=group(g,x,z,angle);box(s,0,.2,0,w,.25,.88,M.darkWood,.04);box(s,0,.4,0,w,.27,.91,M.fabric,.09);box(s,0,.75,-.39,w,.68,.21,M.fabric,.09);for(const v of [-1,1])box(s,v*(w/2-.09),.63,.02,.2,.52,.95,M.fabric,.08);const count=w<1.3?1:3;for(let i=0;i<count;i++){const xx=-w/2+.23+(i+.5)*(w-.46)/count;box(s,xx,.57,.03,(w-.49)/count,.15,.68,M.linen,.06);}for(const v of [-1,1]){const p=box(s,v*(w/2-.42),.84,-.18,.35,.36,.13,M.pillow,.07);p.rotation.z=v*.16;p.rotation.x=-.22;}return s;}
function bed(g,single=false,x=0,z=0){let w=single?.93:1.65;box(g,x,.2,z,w+.12,.3,2.04,M.wood,.03);box(g,x,.43,z,w,.25,1.98,M.linen,.08);box(g,x,.52,z+.3,w+.02,.1,1.27,M.fabric,.05);box(g,x,.59,z+.65,w+.02,.055,.4,M.blanket,.02);box(g,x,.63,z-1.02,w+.2,1.12,.12,M.fabric,.06);for(let i=0;i<(single?1:2);i++){let xx=x+(single?0:(i-.5)*.75);box(g,xx,.62,z-.65,single?.65:.62,.15,.38,M.linen,.1);}if(!single){for(const a of [-1,1]){cyl(g,x+a*(w/2+.34),.22,z-.65,.25,.4,M.wood);cyl(g,x+a*(w/2+.34),.49,z-.65,.07,.14,M.gold);cyl(g,x+a*(w/2+.34),.65,z-.65,.14,.22,M.linen);}}}
function kitchenCab(g,x,z,w=1,d=.65){box(g,x,.44,z,w,.88,d,M.cabinet);box(g,x,.91,z,w+.025,.065,d+.05,M.stone);let n=Math.max(1,Math.round(w/.55));for(let i=0;i<n;i++){let xx=x-w/2+(i+.5)*w/n;box(g,xx,.44,z+d/2+.009,w/n-.025,.81,.02,M.wall);box(g,xx,.71,z+d/2+.03,.18,.022,.025,M.gold);}}
function sink(g,x,z,angle=0){const s=group(g,x,z,angle);box(s,0,.956,0,.55,.015,.4,M.metal,.02);box(s,0,.96,0,.44,.018,.31,M.water,.04);cyl(s,0,1.1,-.2,.018,.33,M.metal);box(s,0,1.26,-.11,.035,.035,.2,M.metal);}
function hob(g,x,z){box(g,x,.965,z,.6,.028,.58,M.black,.03);for(const a of [-1,1])for(const b of [-1,1]){const t=new THREE.Mesh(new THREE.TorusGeometry(.095,.005,5,24),M.metal);t.rotation.x=-Math.PI/2;t.position.set(x+a*.145,.983,z+b*.14);g.add(t);}}
function toilet(g,x,z,angle=0){const t=group(g,x,z,angle);box(t,0,.48,-.22,.39,.72,.16,M.porcelain,.05);sphere(t,0,.23,0,.17,.22,.22,M.porcelain);sphere(t,0,.43,.06,.225,.07,.29,M.porcelain);sphere(t,0,.474,.065,.135,.014,.19,M.wall);cyl(t,0,.855,-.22,.025,.007,M.metal);}
function vanity(g,x,z,w=.6){box(g,x,.61,z,w,.5,.43,M.wood,.025);box(g,x,.875,z,w+.02,.055,.46,M.stone);sphere(g,x,.915,z,.21,.035,.16,M.porcelain);sphere(g,x,.938,z,.15,.007,.105,M.wall);cyl(g,x,.995,z-.15,.014,.17,M.metal);}
function shower(g,x,z,w=.8,d=.8){box(g,x,.03,z,w,.035,d,M.stone);box(g,x-w/2,.95,z,.016,1.85,d,M.glass);box(g,x, .95,z+d/2,w,1.85,.016,M.glass);cyl(g,x,1.28,z-d/2+.08,.015,1.25,M.metal);box(g,x,1.92,z-d/2+.21,.025,.025,.28,M.metal);box(g,x,1.9,z-d/2+.32,.18,.025,.18,M.metal);}
function addItem(o){const g=group(furnishings,o.x,o.z,o.angle);switch(o.type){
 case'bed':rug(g,2.9,2.7);bed(g);break;
 case'twin':rug(g,2.6,2.5);bed(g,true,-.65,0);bed(g,true,.65,0);break;
 case'desk':rug(g,1.65,1.9,0,.25);box(g,0,.78,0,1.45,.07,.64,M.wood,.02);legs(g,0,0,1.25,.48,.75);chair(g,0,.72,Math.PI);box(g,0,1.08,-.09,.6,.37,.035,M.black,.015);cyl(g,0,.9,-.09,.025,.25,M.metal);box(g,0,.83,.14,.47,.016,.16,M.metal);plant(g,.56,-.1,.3);break;
 case'wardrobe':box(g,0,1.18,0,o.length||2,2.35,.5,M.wall);for(let i=0;i<Math.round((o.length||2)/.5);i++){let x=-(o.length||2)/2+(i+.5)*.5;box(g,x,1.18,.257,.48,2.29,.02,M.fabric);box(g,x+.15,1.05,.28,.018,.25,.02,M.gold);}break;
 case'sofaL':{let k=o.compact?.8:1;g.scale.set(k,1,k);rug(g,3.5,3.5,0,.3);sofa(g,0,-.9,2.8);sofa(g,-1.05,.55,1.9,Math.PI/2);coffee(g,.35,.5,1.2,.9);break;}
 case'lounge':{let k=o.compact?.78:1;g.scale.set(k,1,k);rug(g,3.2,2.3);sofa(g,0,-.65,2.2);sofa(g,-1.15,.75,.85,Math.PI);sofa(g,1.15,.75,.85,Math.PI);coffee(g,0,.43);break;}
 case'dining':{let w=o.compact?1.6:1.9,d=.9;box(g,0,.8,0,w,.09,d,M.stone,.05);legs(g,0,0,w*.7,d*.65,.75);for(const x of [-.6,0,.6]){if(o.compact&&x===0)continue;chair(g,x,-.79);chair(g,x,.79,Math.PI);}chair(g,-w/2-.35,0,-Math.PI/2);chair(g,w/2+.35,0,Math.PI/2);plant(g,0,0,.32).position.y=.83;break;}
 case'island':{let l=o.length||3;box(g,0,.45,0,.95,.9,l,M.cabinet);box(g,0,.92,0,1.1,.09,l+.12,M.stone,.02);hob(g,0,-l*.25);for(const z of [-l*.3,0,l*.3]){cyl(g,-.9,.3,z,.035,.6,M.gold);cyl(g,-.9,.61,z,.22,.1,M.velvet);}break;}
 case'counter':{let l=o.length||3;kitchenCab(g,0,0,l);sink(g,0,0);box(g,0,1.85,-.07,l,.6,.42,M.wall);for(let i=0;i<Math.floor(l/.6);i++)box(g,-l/2+(i+.5)*.6,1.85,.15,.575,.57,.022,M.cabinet);break;}
 case'bath':{let w=o.narrow?2:1.9;shower(g,-.5,-.32,.8,.8);toilet(g,.45,.2);vanity(g,.5,-.55,.55);break;}
 case'wc':toilet(g,-.3,0);vanity(g,.4,-.3,.6);break;
 case'plant':plant(g,0,0);break;
 case'console':box(g,0,.42,0,1.2,.8,.32,M.wood,.025);plant(g,.36,0,.45).position.y=.85;break;
 }detailItem(o,g);}

function segment(a,b,open=[]){
 const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);const g=group(walls,a[0],a[1],-Math.atan2(dz,dx));const h=2.65,t=.14;
 function panel(start,end,y=0,height=h){
 if(end-start<=.01)return;
 box(g,(start+end)/2,y+height/2,0,end-start,height,t,M.wall);
 const cap=box(g,(start+end)/2,h,0,end-start,.012,t+.003,M.wallTop);cap.userData.cutCap=true;wallCaps.push({mesh:cap,bottom:y,top:y+height});
 if(y===0&&height>.3)for(const side of [-1,1]){box(g,(start+end)/2,.055,side*(t/2+.015),end-start,.11,.028,M.fabric);box(g,(start+end)/2,.119,side*(t/2+.017),end-start,.012,.018,M.wallTop);}
 }
 let at=0;for(const o of [...open].sort((a,b)=>a.at-b.at)){
  let left=Math.max(at,o.at),right=Math.min(length,o.at+o.width);panel(at,left);if(o.type==='door'){
   panel(left,right,2.15,h-2.15);let leaf=group(g,left,0,-.6);leaf.userData.doorLeaf=true;box(leaf,o.width/2,1.05,0,o.width-.05,2.1,.04,M.wood);box(leaf,o.width-.17,1.03,.047,.09,.025,.025,M.gold);
   for(const x of [left-.022,right+.022])box(g,x,1.09,0,.045,2.18,.19,M.fabric);
   box(g,(left+right)/2,2.18,0,right-left+.09,.055,.19,M.fabric);
   box(g,(left+right)/2,.022,0,right-left,.035,.2,M.stone);
   box(leaf,o.width/2,1.25,.025,o.width-.2,1.18,.012,M.darkWood);
   box(leaf,o.width/2,.35,.025,o.width-.2,.43,.012,M.darkWood);
  }else{
   box(g,(left+right)/2,.715,0,right-left+.12,.065,.27,M.stone,.012);
   panel(left,right,0,.72);panel(left,right,2.38,h-2.38);box(g,(left+right)/2,1.55,0,right-left,1.66,.035,M.glass);for(const x of [left,(left+right)/2,right])box(g,x,1.55,0,.045,1.68,.09,M.metal);for(const y of [.72,1.65,2.38])box(g,(left+right)/2,y,0,right-left,.045,.09,M.metal);
  }at=right;
 }panel(at,length);
}
function floorShape(points){const s=new THREE.Shape();points.forEach(([x,z],i)=>i?s.lineTo(x,-z):s.moveTo(x,-z));s.closePath();return s;}
function build(i){
 roomMeshes.forEach(m=>m.material.dispose());wallMaterials.forEach(m=>m.dispose());wallMaterials=[];wallCaps=[];
 if(model){scene.remove(model);model.traverse(o=>{if(o.geometry)o.geometry.dispose();});}
 labels.forEach(l=>l.el.remove());labels=[];roomMeshes=[];selected=null;$('room-info').hidden=true;
 model=new THREE.Group();scene.add(model);walls=new THREE.Group();model.add(walls);furnishings=new THREE.Group();model.add(furnishings);
 const p=plans[i],shape=floorShape(p.outline);const base=mesh(new THREE.ExtrudeGeometry(shape,{depth:.23,bevelEnabled:false}),M.base,model);base.rotation.x=-Math.PI/2;base.position.y=-.23;
 const floor=mesh(new THREE.ShapeGeometry(shape),M.floor,model);floor.rotation.x=-Math.PI/2;floor.position.y=.002;floor.receiveShadow=true;
 // Shape UVs are world coordinates, so use a repeat appropriate to the plank size.
 floor.material=M.floor;
 p.outline.forEach((a,k)=>segment(a,p.outline[(k+1)%p.outline.length],p.exterior[k]||[]));
 p.walls.forEach(([x,z,x2,z2,open])=>segment([x,z],[x2,z2],open||[]));
 p.rooms.forEach((r,k)=>{
  if(r.type!=='wood'){const tile=box(model,r.x+r.w/2,.008,r.z+r.d/2,r.w-.1,.016,r.d-.1,r.type==='tile'?M.tile:M.stone);tile.receiveShadow=true;}
  const pick=mesh(new THREE.PlaneGeometry(r.w-.12,r.d-.12),new THREE.MeshBasicMaterial({color:'#76a882',transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}),model,r.x+r.w/2,.05,r.z+r.d/2);pick.rotation.x=-Math.PI/2;pick.userData.room=k;roomMeshes.push(pick);
  const el=document.createElement('button');el.className='roomlabel';el.textContent=roomName(r.name);el.setAttribute('aria-label','نمایش '+roomName(r.name));el.onclick=()=>selectRoom(k);$('labels').append(el);labels.push({el,name:roomName(r.name),key:r.name,pos:new THREE.Vector3(r.x+r.w/2,.95,r.z+r.d/2)});
 });
 p.items.forEach(addItem);
 const clones=new Map();walls.traverse(o=>{if(!o.isMesh||o.userData.cutCap)return;const original=o.material;if(!clones.has(original)){const copy=original.clone();copy.clippingPlanes=[cutPlane];copy.clipShadows=true;clones.set(original,copy);wallMaterials.push(copy);}o.material=clones.get(original);});
 wallMeshes=[];walls.traverse(o=>{if(o.isMesh&&!o.userData.cutCap&&!o.parent.userData.doorLeaf)wallMeshes.push(o);});if(lighting)lighting.rebuild(p.rooms);updateWallHeight();populateRooms();furnishings.visible=$('furniture').checked;
 const xs=p.outline.map(q=>q[0]),zs=p.outline.map(q=>q[1]);centre.set((Math.min(...xs)+Math.max(...xs))/2,0,(Math.min(...zs)+Math.max(...zs))/2);span=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...zs)-Math.min(...zs));
 orbit.minDistance=2.7;orbit.maxDistance=span*3.2;resetView(false);renderer.shadowMap.needsUpdate=true,dirty=2;
}

function frameDestination(top=false){const aspect=camera.aspect;const distance=span*(aspect<1?1.15/aspect:1.28);return top?centre.clone().add(new THREE.Vector3(0,distance*1.35,.005)):centre.clone().add(new THREE.Vector3(distance*.55,distance*.88,distance*.86));}
function moveTo(position,target,smooth=true){if(!smooth||reduced){camera.position.copy(position);orbit.target.copy(target);orbit.update();flight=null;}else flight={from:camera.position.clone(),to:position.clone(),targetFrom:orbit.target.clone(),targetTo:target.clone(),start:performance.now()};}
function resetView(smooth=true){roomMeshes.forEach(m=>m.material.opacity=0);labels.forEach(l=>l.el.classList.remove('selected'));selected=null;$('room-picker').value='';$('room-info').hidden=true;setAngle(false,smooth);}
function setAngle(top,smooth=true){if(!ready&& !camera)return;moveTo(frameDestination(top),centre,smooth);$('top').classList.toggle('active',top);$('perspective').classList.toggle('active',!top);$('top').setAttribute('aria-pressed',String(top));$('perspective').setAttribute('aria-pressed',String(!top));}
function selectRoom(k){if(!ready||view!=='3d')return;const r=plans[active].rooms[k];if(!r)return;if(walk&&walk.state.active){walk.enter(new THREE.Vector3(r.x+r.w/2,0,r.z+r.d/2),walk.state.yaw);walkRoom=-1;updateWalkRoom(camera.position);$('room-picker').value=String(k);return;}selected=k;roomMeshes.forEach((m,i)=>m.material.opacity=i===k?.15:0);labels.forEach((l,i)=>l.el.classList.toggle('selected',i===k));$('room-name').textContent=roomName(r.name);$('room-description').textContent=roomDescriptions[r.name]||'فضای دیگری را برای ادامه کاوش انتخاب کنید.';updateRoomPhoto(r.name);$('room-picker').value=String(k);$('room-info').hidden=false;$('announce').textContent=roomName(r.name)+' انتخاب شد';const target=new THREE.Vector3(r.x+r.w/2,0,r.z+r.d/2),offset=camera.position.clone().sub(orbit.target).normalize().multiplyScalar(Math.max(r.w,r.d)*2+3);moveTo(target.clone().add(offset),target);}
function selectPlan(i){if(!Number.isInteger(i)||i<0||i>=plans.length)throw new Error('Choose a residence from 1 to 4.');exitWalk();active=i;[...nav.children].forEach((b,k)=>{b.classList.toggle('active',i===k);b.setAttribute('aria-pressed',String(i===k));});$('plan-title').textContent='واحد '+fa(TYPES[i]);$('reference').src=plans[i].image;$('reference').alt='پلان مفهومی واحد '+fa(TYPES[i]);updateCounts(i);if(ready)build(i);$('announce').textContent='واحد '+fa(TYPES[i])+' انتخاب شد';}
function setMode(mode){if(mode==='image')exitWalk();view=mode;dirty=2;document.querySelectorAll('.controls button,.controls input').forEach(el=>el.disabled=mode==='image');$('reference').hidden=mode!=='image';$('canvas-host').hidden=mode==='image';$('labels').hidden=mode==='image'||!$('roomlabels').checked;document.querySelector('.controls').classList.toggle('disabled',mode==='image');$('mode3d').classList.toggle('active',mode==='3d');$('modeimage').classList.toggle('active',mode==='image');$('mode3d').setAttribute('aria-pressed',String(mode==='3d'));$('modeimage').setAttribute('aria-pressed',String(mode==='image'));$('room-info').hidden=mode==='image'||selected===null;document.querySelector('.compass').hidden=mode==='image';$('gesture-help').textContent=mode==='3d'?'برای چرخاندن بکشید · برای بزرگ‌نمایی اسکرول کنید یا با دو انگشت باز کنید · یک فضا را انتخاب کنید':'برای دیدن پلان هر واحد، آن را انتخاب کنید';if(mode==='image'){$('error').hidden=true;$('loading').hidden=true;}else if(!ready){$('error').hidden=false;}}
function resize(){if(!renderer)return;const w=$('stage').clientWidth,h=$('stage').clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();dirty=2;}
const roomDescriptions={
 'Primary bedroom':'تخت دونفره، تاج تخت پارچه‌ای، روتختی لایه‌ای و چراغ کنار تخت.',
 'Twin bedroom':'دو تخت یک‌نفره با روتختی جداگانه و فرش مشترک.',
 'Study':'اتاق خواب سوم؛ در این مدل با چیدمان اتاق کار نمایش داده شده است.',
 'En suite':'دوش شیشه‌ای، روشویی، آینه و سرویس.',
 'Bathroom':'دوش شیشه‌ای، کابینت روشویی و متعلقات حمام.',
 'Guest WC':'سرویس و روشویی با آینه.',
 'Kitchen':'کانترهای سنگی، لوازم توکار، جزیره و صندلی‌های صبحانه.',
 'Service kitchen':'فضای آماده‌سازی جانبی و بسته.',
 'Living room':'مبلمان راحتی، فرش بافت‌دار و میز سنگی.',
 'Lounge':'گروهی جداگانه از مبلمان برای استفاده روزمره.',
 'Dining':'میز ناهارخوری با صندلی‌های پارچه‌ای.',
 'Entrance':'ورودی واحد و ارتباط آن با فضاهای زندگی.',
 'Balcony':'فضای باز فرورفته‌ای که در پلان دیده می‌شود.'
};
function populateRooms(){const picker=$('room-picker');picker.replaceChildren(new Option('یک فضا را انتخاب کنید…',''));plans[active].rooms.forEach((r,i)=>picker.add(new Option(roomName(r.name),String(i))));}
function updateWallHeight(){const h=2.65*Number($('walls').value)/100;cutPlane.constant=h;for(const cap of wallCaps){cap.mesh.visible=h>cap.bottom+.012;cap.mesh.position.y=Math.min(h,cap.top);}if(renderer)renderer.shadowMap.needsUpdate=true,dirty=2;}
function updateLabels(){
 if(view!=='3d'||!$('roomlabels').checked)return;
 const w=$('stage').clientWidth,h=$('stage').clientHeight,occupied=[];
 const order=labels.map((l,i)=>({l,i})).sort((a,b)=>(a.i===selected?-1:b.i===selected?1:0));
 for(const {l,i} of order){
  const v=l.pos.clone().project(camera),x=(v.x*.5+.5)*w,y=(-v.y*.5+.5)*h;
  const width=l.name.length*6.5+20,height=27,rect={left:x-width/2,right:x+width/2,top:y-height/2,bottom:y+height/2};
  let hidden=v.z>1||v.z< -1||rect.left<3||rect.right>w-3||rect.top<3||rect.bottom>h-27;
  if(i!==selected&&camera.position.distanceTo(orbit.target)>span*1.25&&['En suite','Bathroom','Guest WC','Entrance','Balcony','Service kitchen'].includes(l.key))hidden=true;
  if(!hidden&&occupied.some(r=>rect.left<r.right+6&&rect.right>r.left-6&&rect.top<r.bottom+5&&rect.bottom>r.top-5))hidden=true;
  l.el.style.display=hidden?'none':'';if(!hidden){l.el.style.left=x+'px';l.el.style.top=y+'px';occupied.push(rect);}
 }
}
function animate(){requestAnimationFrame(animate);const now=performance.now(),dt=Math.min(.05,(now-lastFrame)/1000);lastFrame=now;if(!ready||view!=='3d')return;if(walk&&walk.state.active){walk.update(dt);$('compass-needle').style.transform=`rotate(${-walk.state.yaw*180/Math.PI}deg)`;renderer.render(scene,camera);return;}const flying=!!flight;if(flight){const t=Math.min(1,(performance.now()-flight.start)/650),e=1-Math.pow(1-t,3);camera.position.lerpVectors(flight.from,flight.to,e);orbit.target.lerpVectors(flight.targetFrom,flight.targetTo,e);if(t===1)flight=null;}const moved=orbit.update()||flying;if(!moved&&dirty<=0)return;if(dirty>0)dirty--;updateLabels();$('compass-needle').style.transform=`rotate(${-orbit.getAzimuthalAngle()*180/Math.PI}deg)`;renderer.render(scene,camera);}
try{
 renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.localClippingEnabled=true;renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;renderer.setClearColor('#f4f6f5',0);$('canvas-host').append(renderer.domElement);renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','مدل سه‌بعدی واحد. برای چرخاندن بکشید، با کلیدهای جهت جابه‌جا کنید و با اسکرول بزرگ‌نمایی کنید.');
 scene=new THREE.Scene();
 const pmrem=new THREE.PMREMGenerator(renderer),envScene=new RoomEnvironment();
 scene.environment=pmrem.fromScene(envScene,.06).texture;scene.environmentIntensity=.5;envScene.dispose();pmrem.dispose();
 camera=new THREE.PerspectiveCamera(38,1,.1,160);orbit=new OrbitControls(camera,renderer.domElement);orbit.enableDamping=true;orbit.dampingFactor=.08;orbit.maxPolarAngle=Math.PI*.47;orbit.minPolarAngle=.001;orbit.enablePan=true;orbit.screenSpacePanning=true;orbit.listenToKeyEvents(renderer.domElement);orbit.addEventListener('start',()=>{flight=null;});
 hemi=new THREE.HemisphereLight('#ffffff','#9a947b',1.65);scene.add(hemi);const sun=new THREE.DirectionalLight('#fff3de',3.3);sun.position.set(-10,24,8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-25;sun.shadow.camera.right=25;sun.shadow.camera.top=25;sun.shadow.camera.bottom=-25;sun.shadow.camera.far=70;sun.shadow.normalBias=.025;sun.shadow.bias=-.0001;sun.shadow.radius=3;scene.add(sun);const fill=new THREE.DirectionalLight('#e1efff',1.2);fill.position.set(18,14,-10);scene.add(fill);
 const ground=mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.16}),scene,0,-.25,0);ground.rotation.x=-Math.PI/2;ground.castShadow=false;ground.receiveShadow=true;lighting=createLighting(THREE,{scene,renderer,hemi,sun,fill,ground});walk=createWalk(THREE,{camera,canvas:renderer.domElement,walls:()=>wallMeshes,floorTargets:()=>roomMeshes,onMove:updateWalkRoom});
 ready=true;resize();selectPlan(0);$('loading').hidden=true;animate();new ResizeObserver(()=>{resize();}).observe($('stage'));
 let down=null,pointers=new Set(),multiTouch=false;renderer.domElement.addEventListener('pointerdown',e=>{pointers.add(e.pointerId);if(pointers.size>1)multiTouch=true;if(pointers.size===1){multiTouch=false;down={x:e.clientX,y:e.clientY};}});renderer.domElement.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);down=null;});renderer.domElement.addEventListener('pointerup',e=>{pointers.delete(e.pointerId);if(walk.state.active){down=null;return;}if(multiTouch)return;if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)return;const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObjects(roomMeshes);if(hits.length)selectRoom(hits[0].object.userData.room);down=null;});
 renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();ready=false;$('error').hidden=false;});
}catch(error){console.error('3D initialization failed',error);$('loading').hidden=true;$('error').hidden=false;ready=false;}
$('reference').src=plans[0].image;
// Legacy V8 links used ?type=a..d; shape-matched to the numbered apartments (A→1, D→2, C→3, B→4).
const typeIndex={a:0,d:1,c:2,b:3,'1':0,'2':1,'3':2,'4':3};
const urlParams=new URLSearchParams(location.search);
const requestedType=(urlParams.get('apt')||urlParams.get('type'))?.toLowerCase();
if(requestedType&&Object.hasOwn(typeIndex,requestedType))selectPlan(typeIndex[requestedType]);
$('room-picker').onchange=e=>{if(e.target.value!==''){setMode('3d');selectRoom(Number(e.target.value));}else if(ready)resetView();};
$('room-prev').onclick=()=>selectRoom((selected-1+plans[active].rooms.length)%plans[active].rooms.length);
$('room-next').onclick=()=>selectRoom((selected+1)%plans[active].rooms.length);
$('mode3d').onclick=()=>setMode('3d');$('modeimage').onclick=()=>setMode('image');$('fallback').onclick=()=>setMode('image');
$('perspective').onclick=()=>{if(ready){exitWalk();setAngle(false);}};$('top').onclick=()=>{if(ready){exitWalk();setAngle(true);}};$('reset').onclick=()=>{if(ready){exitWalk();resetView();}};$('room-clear').onclick=()=>resetView();
function toggleFullscreen(){
 const node=document.querySelector('main');
 const current=document.fullscreenElement||document.webkitFullscreenElement;
 if(current){(document.exitFullscreen||document.webkitExitFullscreen).call(document);return;}
 const req=node.requestFullscreen||node.webkitRequestFullscreen;
 if(req)Promise.resolve(req.call(node)).catch(()=>{});
}
function syncFullscreen(){
 const on=!!(document.fullscreenElement||document.webkitFullscreenElement);
 const b=$('fullscreen');if(!b)return;
 b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));
 const label=on?'خروج از تمام‌صفحه':'تمام‌صفحه';
 b.title=label;b.setAttribute('aria-label',label);
 const caption=b.querySelector('span');if(caption)caption.textContent=on?'خروج':'تمام‌صفحه';
 resize();dirty=2;
}
$('fullscreen').onclick=toggleFullscreen;
document.addEventListener('fullscreenchange',syncFullscreen);
document.addEventListener('webkitfullscreenchange',syncFullscreen);
function zoom(factor){if(!ready)return;if(walk&&walk.state.active){camera.fov=THREE.MathUtils.clamp(camera.fov*factor,45,85);camera.updateProjectionMatrix();return;}const d=camera.position.clone().sub(orbit.target);d.setLength(THREE.MathUtils.clamp(d.length()*factor,orbit.minDistance,orbit.maxDistance));moveTo(orbit.target.clone().add(d),orbit.target);}
$('zoomin').onclick=()=>zoom(.8);$('zoomout').onclick=()=>zoom(1.25);
$('walls').oninput=e=>{updateWallHeight();if(renderer)renderer.shadowMap.needsUpdate=true,dirty=2;$('wall-value').textContent=Number(e.target.value)>85?'کامل':'برش';};
$('furniture').onchange=e=>{if(furnishings)furnishings.visible=e.target.checked;if(renderer)renderer.shadowMap.needsUpdate=true,dirty=2;};$('roomlabels').onchange=e=>{$('labels').hidden=!e.target.checked||view==='image';};
// Gallery photos showing each kind of space. The interior renders are samples, not tied to a residence type.
const ROOM_PHOTO={'Living room':'living','Lounge':'living','Dining':'living','Kitchen':'kitchen','Service kitchen':'kitchen','Primary bedroom':'bedroom','Twin bedroom':'bedroom','En suite':'bathroom','Bathroom':'bathroom','Guest WC':'bathroom'};
function photoLink(link,name){const photo=ROOM_PHOTO[name];link.hidden=!photo;if(!photo)return;const GAL={bathroom:'bath'},THUMB={living:'living-900',kitchen:'kitchen-900',bedroom:'bedroom-900',bathroom:'bath-700'};link.href=(window.__goLang&&window.__goLang()==='en'?'../en/':'../')+'gallery.html?photo='+(GAL[photo]||photo);const img=link.querySelector('img');if(img)img.src='../assets/img/'+THUMB[photo]+'.webp';}
function updateRoomPhoto(name){photoLink($('room-photo'),name);}
function currentRoom(pos){const rooms=plans[active].rooms;for(let k=0;k<rooms.length;k++){const r=rooms[k];if(pos.x>=r.x&&pos.x<=r.x+r.w&&pos.z>=r.z&&pos.z<=r.z+r.d)return k;}return -1;}
function updateWalkRoom(pos){const k=currentRoom(pos);if(k===walkRoom)return;walkRoom=k;const name=k<0?'':plans[active].rooms[k].name;$('walk-room').textContent=name?roomName(name):'';photoLink($('walk-photo'),name);if(name)$('announce').textContent=roomName(name);}
function startRoomIndex(){if(selected!==null)return selected;const rooms=plans[active].rooms;const find=n=>rooms.findIndex(r=>r.name===n);return [find('Entrance'),find('Living room'),0].find(i=>i>=0);}
function enterWalk(k){if(!ready||view!=='3d'||!walk)return;const r=plans[active].rooms[k];const pos=new THREE.Vector3(r.x+r.w/2,0,r.z+r.d/2);flight=null;orbit.enabled=false;savedWalls=$('walls').value;$('walls').value='100';$('walls').disabled=true;updateWallHeight();camera.fov=70;camera.updateProjectionMatrix();walk.enter(pos,Math.atan2(pos.x-centre.x,pos.z-centre.z));document.documentElement.classList.add('is-walking');$('walk-hud').hidden=false;$('labels').hidden=true;$('room-info').hidden=true;$('walk').classList.add('active');$('walk').setAttribute('aria-pressed','true');walkRoom=-1;updateWalkRoom(pos);$('announce').textContent='گردش در واحد آغاز شد';renderer.domElement.focus();}
function exitWalk(){if(!walk||!walk.state.active)return;walk.exit();orbit.enabled=true;camera.fov=38;camera.updateProjectionMatrix();$('walls').disabled=false;$('walls').value=savedWalls;updateWallHeight();document.documentElement.classList.remove('is-walking');$('walk-hud').hidden=true;$('labels').hidden=!$('roomlabels').checked||view==='image';$('walk').classList.remove('active');$('walk').setAttribute('aria-pressed','false');resetView(false);}
function setMood(next){if(!lighting)return;lighting.set(next,plans[active].rooms);dirty=2;const night=next==='night';document.documentElement.classList.toggle('is-night',night);const b=$('mood');b.setAttribute('aria-pressed',String(night));b.querySelector('span').textContent=night?'روز':'شب';b.title=night?'نمای روز':'نمای شب';b.setAttribute('aria-label',b.title);$('announce').textContent=night?'نمای شب':'نمای روز';}
$('walk').onclick=()=>{if(walk&&walk.state.active)exitWalk();else enterWalk(startRoomIndex());};
$('walk-exit').onclick=()=>{exitWalk();$('walk').focus();};
$('mood').onclick=()=>setMood(lighting&&lighting.mood==='night'?'day':'night');
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&walk&&walk.state.active){exitWalk();$('walk').focus();}});
// Agent controls use exactly the same state transitions as the visible controls.
if(document.modelContext?.registerTool){
 const ac=new AbortController();window.addEventListener('pagehide',()=>ac.abort(),{once:true});
 const register=t=>{try{Promise.resolve(document.modelContext.registerTool(t,{signal:ac.signal})).catch(()=>{});}catch{}};
 register({name:'view_residence',title:'View a residence',description:'Select one of the four residences and optionally use the top, perspective, or plan-render view.',inputSchema:{type:'object',properties:{residence:{type:'integer',minimum:1,maximum:4},view:{type:'string',enum:['perspective','top','render']}},required:['residence'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:async input=>{if(!input||!Number.isInteger(input.residence)||input.residence<1||input.residence>4||input.view&&!['perspective','top','render'].includes(input.view))throw Error('Invalid residence or view');selectPlan(input.residence-1);setMode(input.view==='render'?'image':'3d');if(ready&&input.view!=='render')setAngle(input.view==='top',false);return{residence:plans[active].name,view,rooms:plans[active].rooms.map(r=>r.name),modelAvailable:ready};}});
}
