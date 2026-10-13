// Fine furnishing detail, kept within each existing furniture footprint.
export function makeDetailer(THREE,M,{box,cyl,sphere,group}){
 const steel=new THREE.MeshStandardMaterial({color:'#aeb4b4',metalness:.8,roughness:.28});
 const mirror=new THREE.MeshStandardMaterial({color:'#b7ced0',metalness:.94,roughness:.09});
 const paper=new THREE.MeshStandardMaterial({color:'#f7f0de',roughness:1});
 const leather=new THREE.MeshStandardMaterial({color:'#5e725e',roughness:.88});
 const glow=new THREE.MeshStandardMaterial({color:'#fff4ce',emissive:'#ffe0a3',emissiveIntensity:.6});
 function book(g,x,y,z,w=.2,d=.28,a=0){const b=group(g,x,z,a);b.position.y=y;box(b,0,.022,0,w,.04,d,paper);box(b,0,.047,0,w+.012,.01,d+.01,leather);box(b,0,-.001,0,w+.012,.01,d+.01,leather);}
 function towel(g,x,y,z,w=.3,d=.25){box(g,x,y,z,w,.045,d,M.linen,.025);box(g,x,y+.045,z,w*.97,.04,d*.98,M.fabric,.018);}
 function plate(g,x,y,z){cyl(g,x,y,z,.15,.014,M.porcelain);cyl(g,x,y+.014,z,.105,.014,M.porcelain);box(g,x,y+.031,z,.075,.018,.17,leather,.008);box(g,x-.2,y,z,.013,.012,.2,steel);box(g,x+.2,y,z,.013,.012,.2,steel);cyl(g,x+.21,y+.1,z-.17,.033,.17,M.glass);cyl(g,x+.21,y+.014,z-.17,.043,.01,M.glass);}
 function detail(o,g){
  if(o.type==='bed'||o.type==='twin'){
   for(const x of o.type==='twin'?[-.65,.65]:[0]){const w=o.type==='twin'?.93:1.65;
    for(let i=0;i<8;i++)box(g,x-w/2+(i+.5)*w/8,.82,-1.096,w/8-.008,.65,.016,M.linen,.012);
    for(let i=0;i<6;i++){const t=box(g,x-w/2+(i+.5)*w/6,.625,.67,w/6+.007,.027,.43,M.blanket,.009);t.rotation.z=Math.sin(i*2)*.02;}
    box(g,x+w/2-.015,.42,.68,.035,.35,.43,M.blanket,.012);
    for(const side of [-1,1])box(g,x+side*(w/2-.02),.51,.08,.016,.012,1.6,M.linen);
   }
   if(o.type==='bed'){book(g,-1.165,.435,-.61,.2,.25,.1);cyl(g,1.165,.787,-.65,.025,.018,M.gold);}
  }
  if(o.type==='desk'){
   for(let row=0;row<4;row++)for(let col=0;col<12;col++)box(g,-.205+col*.037,.844,.084+row*.029,.026,.005,.019,paper);
   sphere(g,.4,.84,.2,.045,.022,.067,M.metal);box(g,.4,.819,.2,.2,.008,.22,leather,.01);
   book(g,-.56,.826,.02,.21,.29,-.06);cyl(g,-.58,.89,-.15,.05,.13,M.fabric);
   for(let i=0;i<3;i++)cyl(g,-.6+i*.015,1,-.15,.005,.14,M.wood);
   box(g,0,1.08,-.067,.52,.29,.007,mirror);
  }
  if(o.type==='dining'){
   const w=o.compact?1.6:1.9;for(const x of [-.6,0,.6]){if(o.compact&&x===0)continue;plate(g,x,.86,-.25);plate(g,x,.86,.25);}
   // A narrow woven runner remains clear of the individual place settings.
   box(g,0,.851,0,w-.1,.006,.16,leather,.01);
  }
  if(o.type==='sofaL'||o.type==='lounge'){
   const x=o.type==='sofaL'?.35:0,z=o.type==='sofaL'?.5:.43;
   book(g,x-.25,.427,z,.24,.29,.09);book(g,x-.25,.48,z,.21,.26,-.05);
   cyl(g,x+.32,.46,z+.18,.047,.095,M.porcelain);cyl(g,x+.32,.51,z+.18,.035,.003,M.wood);
   // Upholstery piping catches light without adding bulky geometry.
   box(g,.5,.658,-.64,.7,.012,.6,M.blanket,.005);
  }
  if(o.type==='counter'){
   const l=o.length||3,fx=-l/2+.32;
   if(l>2.5){box(g,fx,1.12,.02,.62,2.22,.66,M.cabinet,.02);box(g,fx,1.45,.368,.59,1.45,.035,M.wall,.01);box(g,fx,.37,.37,.59,.64,.035,M.wall,.01);box(g,fx+.21,1.25,.397,.022,.52,.03,steel);box(g,fx,.6,.4,.35,.022,.027,steel);}
   const ax=l*.3;box(g,ax,.52,.354,.52,.62,.035,steel,.012);box(g,ax,.47,.377,.44,.39,.016,M.black,.012);box(g,ax,.72,.39,.36,.025,.035,steel);
   for(const x of [ax-.16,ax+.16]){const dial=cyl(g,x,.78,.385,.03,.022,M.metal);dial.rotation.x=Math.PI/2;}
   box(g,l*.26,.97,-.05,.36,.025,.3,M.wood,.015);cyl(g,l*.35,1.095,-.14,.065,.24,M.porcelain);cyl(g,l*.35,1.22,-.14,.06,.015,M.wood);
   box(g,0,1.532,.13,Math.max(.2,l-.15),.014,.025,glow);
   for(let i=0;i<Math.floor(l/.6);i++)box(g,-l/2+(i+.5)*.6,1.62,.179,.19,.012,.018,M.gold);
  }
  if(o.type==='island'){
   const l=o.length||3;for(let i=0;i<Math.ceil(l/.6);i++)box(g,.482,.43,-l/2+(i+.5)*l/Math.ceil(l/.6),.02,.75,l/Math.ceil(l/.6)-.035,M.wall);
   for(const z of [-l*.3,0,l*.3]){const ring=new THREE.Mesh(new THREE.TorusGeometry(.16,.011,6,22),M.gold);ring.rotation.x=Math.PI/2;ring.position.set(-.9,.26,z);g.add(ring);}
   cyl(g,.08,1.01,l*.27,.19,.07,M.stone);for(let i=0;i<3;i++)sphere(g,.08+Math.sin(i*2)*.08,1.075,l*.27+Math.cos(i*2)*.07,.065,.064,.06,leather);
  }
  if(o.type==='bath'||o.type==='wc'){
   const x=o.type==='bath'?.5:.4,z=o.type==='bath'?-.55:-.3;
   box(g,x,1.36,z-.23,.5,.67,.023,M.gold,.055);box(g,x,1.36,z-.21,.46,.63,.012,mirror,.05);
   cyl(g,x+.19,.99,z+.03,.025,.14,M.fabric);cyl(g,x+.19,1.067,z+.03,.023,.024,M.metal);
   if(o.type==='bath'){
    towel(g,-.5,.085,-.3,.24,.29);
    box(g,-.5,.075,-.55,.14,.009,.06,steel);
    box(g,-.06,1.04,.082,.024,.22,.024,steel);
    for(const y of [.38,1.48])box(g,-.89,y,.082,.034,.06,.03,steel);
    box(g,.55,.96,.65,.43,.022,.025,M.gold);box(g,.55,.76,.67,.31,.36,.018,M.linen,.01);
   }
  }
  if(o.type==='wardrobe')box(g,0,.06,.267,o.length||2,.07,.025,M.darkWood);
 }
 return detail;
}
