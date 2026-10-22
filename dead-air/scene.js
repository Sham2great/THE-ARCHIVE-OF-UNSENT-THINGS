import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

(() => {
  const host = document.getElementById('scene');
  if (!host) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let renderer, scene, camera, clock, room, door, doorPivot, figure, figureHead, rain, dust;
  let keyLight, windowGlow, redLight, floor, cassette, photo, glass, table;
  let raf = 0, alive = true, mood = 'room', doorTarget = 0, figureTarget = 0;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const keys = Object.create(null);
  let yaw = 0, pitch = -0.08, dragging = false, lastX = 0, lastY = 0;
  let walkX = 0, walkZ = 4.55, bob = 0;
  const materials = {};
  const temp = new THREE.Vector3();

  const mat = (color, roughness=0.9, metalness=0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const addBox = (parent, name, size, position, material, rotation) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.name = name;
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const group = (parent, position=[0,0,0]) => {
    const g = new THREE.Group();
    g.position.set(...position);
    parent.add(g);
    return g;
  };

  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.id = 'deadAir3d';
    renderer.domElement.setAttribute('aria-hidden','true');
    host.prepend(renderer.domElement);
    host.classList.add('has3d');
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x080b0b, 0.055);
    camera = new THREE.PerspectiveCamera(43, host.clientWidth/host.clientHeight, 0.1, 80);
    camera.position.set(0, 1.72, 4.55);
    camera.lookAt(0, 1.6, 0);
    clock = new THREE.Clock();

    const world = new THREE.Group(); scene.add(world);
    materials.wall = mat(0x20221f);
    materials.side = mat(0x151816);
    materials.floor = mat(0x171a18, .98);
    materials.trim = mat(0x383a32);
    materials.door = mat(0x292a24);
    materials.dark = mat(0x080a09);
    materials.metal = mat(0x625e4e, .32, .6);
    materials.paper = mat(0xb5ae98);
    materials.tape = mat(0x222522);
    materials.glass = new THREE.MeshPhysicalMaterial({color:0x9aa8a0, roughness:.12, metalness:.05, transparent:true, opacity:.25});
    materials.coat = mat(0x101312);
    materials.skin = mat(0x282824);
    materials.red = new THREE.MeshBasicMaterial({color:0x7c3028});
    materials.window = new THREE.MeshBasicMaterial({color:0x263941});
    materials.dust = new THREE.MeshBasicMaterial({color:0xb8c4b7,transparent:true,opacity:.6});

    addBox(world,'back wall',[12,5.5,.25],[0,2.75,-3],materials.wall);
    addBox(world,'left wall',[.25,5.5,8],[-6,2.75,1],materials.side);
    addBox(world,'right wall',[.25,5.5,8],[6,2.75,1],materials.side);
    addBox(world,'ceiling',[12,.2,8],[0,5.5,1],materials.side);
    floor=addBox(world,'floor',[12,.16,8],[0,-.08,1],materials.floor);
    // Long floorboards catch just enough light to make the room feel tangible.
    for(let i=-5;i<=5;i++) addBox(world,'floor seam',[.012,.006,7.7],[i,0.008,1],mat(0x282a25));
    for(let z=-2.5;z<4.5;z+=1.15) addBox(world,'board seam',[11.8,.008,.012],[0,.009,z],mat(0x252824));

    // Window, with cold blue light and rain passing beyond it.
    const win=group(world,[-3.1,2.9,-2.82]);
    addBox(win,'night window',[1.8,2.1,.08],[0,0,0],materials.window);
    for(const x of [-.94,0,.94]) addBox(win,'window frame',[.07,2.28,.13],[x,0,.04],materials.trim);
    for(const y of [-.5,.55]) addBox(win,'window frame',[1.95,.07,.13],[0,y,.04],materials.trim);
    windowGlow=new THREE.PointLight(0x66899a,2.2,10,2); windowGlow.position.set(-3,3.2,-1.8); world.add(windowGlow);

    // Door on the back wall: hinged geometry makes the opening a physical event.
    doorPivot=group(world,[2.8,0,-2.82]);
    door=addBox(doorPivot,'door leaf',[1.55,3.35,.16],[.76,1.68,0],materials.door);
    addBox(doorPivot,'door inset',[1.25,1.15,.035],[.76,2.2,.1],materials.side);
    addBox(doorPivot,'door lower inset',[1.25,.8,.035],[.76,.8,.1],materials.side);
    const knob=new THREE.Mesh(new THREE.SphereGeometry(.065,12,8),materials.metal);knob.position.set(1.3,1.55,.15);doorPivot.add(knob);
    // Wall trim and an impossible dark gap under the door.
    addBox(world,'door lintel',[1.8,.12,.2],[3.55,3.43,-2.72],materials.trim);
    addBox(world,'door frame left',[.12,3.5,.2],[2.7,1.72,-2.72],materials.trim);
    addBox(world,'door frame right',[.12,3.5,.2],[4.4,1.72,-2.72],materials.trim);

    // Table and its three objects are real meshes, not a background image.
    table=group(world,[0,1.05,-.1]);
    addBox(table,'table top',[2.8,.14,1.1],[0,0,0],mat(0x342d23));
    for(const x of [-1.18,1.18]) for(const z of [-.4,.4]) addBox(table,'table leg',[.11,1.02,.11],[x,-.55,z],mat(0x211d18));
    cassette=group(table,[-.35,.13,-.08]);
    addBox(cassette,'cassette body',[.68,.12,.43],[0,0,0],materials.tape);
    for(const x of [-.15,.15]){const reel=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,.025,20),materials.metal);reel.rotation.x=Math.PI/2;reel.position.set(x,.065,.02);cassette.add(reel);}
    photo=group(table,[.48,.09,.14]);
    addBox(photo,'photograph',[.56,.035,.72],[0,0,0],materials.paper,[0,-.08,.04]);
    addBox(photo,'photo shadow',[.18,.012,.24],[.04,.025,-.05],materials.dark,[0,-.08,.04]);
    glass=group(table,[.96,.2,-.15]);
    const cup=new THREE.Mesh(new THREE.CylinderGeometry(.13,.1,.32,24,1,true),materials.glass);cup.position.y=.08;glass.add(cup);
    const water=new THREE.Mesh(new THREE.CircleGeometry(.105,24),new THREE.MeshBasicMaterial({color:0x526a6b,transparent:true,opacity:.5}));water.rotation.x=-Math.PI/2;water.position.y=.19;glass.add(water);

    // Human shape, deliberately featureless. It begins folded into the dark.
    figure=group(world,[1.2,0,-1.65]);
    figureHead=new THREE.Mesh(new THREE.SphereGeometry(.22,18,14),materials.skin);figureHead.position.y=1.64;figure.add(figureHead);
    const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.28,.82,5,10),materials.coat);torso.position.y=1.03;torso.rotation.z=-.08;figure.add(torso);
    for(const side of [-1,1]){
      const leg=new THREE.Mesh(new THREE.CapsuleGeometry(.105,.8,4,8),materials.dark);leg.position.set(side*.14,.36,0);figure.add(leg);
      const arm=new THREE.Mesh(new THREE.CapsuleGeometry(.085,.72,4,8),materials.coat);arm.position.set(side*.31,1.02,.03);arm.rotation.z=side*.18;figure.add(arm);
    }
    figure.scale.setScalar(.001);

    // Dust in the light shaft and rain beyond the window.
    const dustCount=170, dustPositions=new Float32Array(dustCount*3);
    for(let i=0;i<dustCount;i++){dustPositions[i*3]=(Math.random()-.5)*7;dustPositions[i*3+1]=Math.random()*4.5;dustPositions[i*3+2]=-1+Math.random()*5;}
    const dustGeo=new THREE.BufferGeometry();dustGeo.setAttribute('position',new THREE.BufferAttribute(dustPositions,3));
    dust=new THREE.Points(dustGeo,materials.dust);scene.add(dust);
    const rainCount=260,rainPositions=new Float32Array(rainCount*3);
    for(let i=0;i<rainCount;i++){rainPositions[i*3]=-4+Math.random()*2;rainPositions[i*3+1]=Math.random()*5;rainPositions[i*3+2]=-3.3+Math.random()*.2;}
    const rainGeo=new THREE.BufferGeometry();rainGeo.setAttribute('position',new THREE.BufferAttribute(rainPositions,3));
    rain=new THREE.Points(rainGeo,new THREE.PointsMaterial({color:0x879ba2,size:.025,transparent:true,opacity:.55}));scene.add(rain);

    scene.add(new THREE.AmbientLight(0x778079,.52));
    keyLight=new THREE.PointLight(0xd1c4a0,1.8,9,2);keyLight.position.set(0,4.8,.4);keyLight.castShadow=true;keyLight.shadow.mapSize.set(512,512);scene.add(keyLight);
    redLight=new THREE.PointLight(0x572a25,0,5,2);redLight.position.set(2.8,1.2,-1.9);scene.add(redLight);

    const resize=()=>{if(!renderer)return;const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();};
    new ResizeObserver(resize).observe(host);
    host.tabIndex=0;
    host.setAttribute('aria-label','Interactive 3D room. Use W A S D or arrow keys to walk, and drag to look around.');
    host.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;host.setPointerCapture?.(e.pointerId);host.focus({preventScroll:true});});
    host.addEventListener('pointerup',()=>{dragging=false;});
    host.addEventListener('pointercancel',()=>{dragging=false;});
    host.addEventListener('pointermove',e=>{
      if(dragging){const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;yaw-=dx*.0045;pitch=Math.max(-.48,Math.min(.38,pitch-dy*.0035));}
      else {const r=host.getBoundingClientRect();pointer.tx=((e.clientX-r.left)/r.width-.5)*.08;pointer.ty=((e.clientY-r.top)/r.height-.5)*.04;}
    });
    host.addEventListener('pointerleave',()=>{if(!dragging){pointer.tx=0;pointer.ty=0;}});
    window.addEventListener('keydown',e=>{
      if(/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||''))return;
      const k=e.key.toLowerCase();
      if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k)){keys[k]=true;if(host.matches(':hover'))e.preventDefault();}
    });
    window.addEventListener('keyup',e=>{keys[e.key.toLowerCase()]=false;});
    window.addEventListener('blur',()=>{Object.keys(keys).forEach(k=>keys[k]=false);dragging=false;});
    document.addEventListener('visibilitychange',()=>{alive=!document.hidden;if(alive&&!raf)animate();});
    const originalRender=window.renderDeadAir3D;
    window.renderDeadAir3D=()=>{};
    window.addEventListener('dead-air-scene',e=>{
      mood=e.detail?.mood||host.dataset.mood||'room';
      const d=document.getElementById('door');
      doorTarget=d?.classList.contains('open')?1:0;
      figureTarget=document.getElementById('figure')?.classList.contains('visible')?1:0;
      if(mood==='cellar'||mood==='outside'){camera.position.z=8.8;}
      if(mood==='paper')cassette.visible=false;else cassette.visible=true;
      photo.visible=['photo','door','paper'].includes(mood);
      redLight.intensity=['figure','cellar'].includes(mood)?0.8:0;
      windowGlow.intensity=mood==='outside'?.8:2.2;
    });
    const observer=new MutationObserver(()=>{mood=host.dataset.mood||'room';doorTarget=document.getElementById('door')?.classList.contains('open')?1:0;figureTarget=document.getElementById('figure')?.classList.contains('visible')?1:0;});
    observer.observe(host,{attributes:true,attributeFilter:['data-mood']});
    const classObserver=new MutationObserver(()=>{doorTarget=document.getElementById('door')?.classList.contains('open')?1:0;figureTarget=document.getElementById('figure')?.classList.contains('visible')?1:0;});
    classObserver.observe(document.getElementById('door'),{attributes:true,attributeFilter:['class']});
    classObserver.observe(document.getElementById('figure'),{attributes:true,attributeFilter:['class']});

    function animate(){
      raf=0;if(!alive||!renderer)return;raf=requestAnimationFrame(animate);
      const dt=Math.min(clock.getDelta(),.05),t=clock.elapsedTime;
      pointer.x+=(pointer.tx-pointer.x)*.018;pointer.y+=(pointer.ty-pointer.y)*.018;
      // Walkable first-person room: WASD/arrows move; dragging the scene turns the camera.
      const forward=(keys.w||keys.arrowup?1:0)-(keys.s||keys.arrowdown?1:0);
      const strafe=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0);
      const moving=forward!==0||strafe!==0;
      const length=Math.hypot(forward,strafe)||1;
      const speed=(keys.shift?2.5:1.55)*dt;
      walkX+=((strafe*Math.cos(yaw)-forward*Math.sin(yaw))/length)*speed;
      walkZ+=((strafe*Math.sin(yaw)+forward*Math.cos(yaw))/length)*speed;
      walkX=Math.max(-4.85,Math.min(4.85,walkX));
      walkZ=Math.max(-2.25,Math.min(4.55,walkZ));
      bob+=(moving?1:0-bob)*.05;
      const step=Math.sin(t*10)*.025*(moving?1:0);
      camera.position.set(walkX+Math.sin(t*.17)*.012,1.7+Math.sin(t*.23)*.018+step,walkZ);
      const lookX=Math.sin(yaw)*Math.cos(pitch),lookY=Math.sin(pitch),lookZ=-Math.cos(yaw)*Math.cos(pitch);
      camera.lookAt(walkX+lookX,1.7+lookY,walkZ+lookZ);
      const close=mood==='cellar'||mood==='paper'||mood==='tape'||mood==='photo';
      // Narrative reveals alter the room lighting without taking movement away.
      keyLight.distance=close?7:9;
      doorPivot.rotation.y+=(doorTarget*(-1.05)-doorPivot.rotation.y)*.018;
      const fs=figure.scale.x+(figureTarget-figure.scale.x)*.025;figure.scale.setScalar(fs);
      figure.position.x=1.2+Math.sin(t*.45)*.035;
      figureHead.rotation.y=Math.sin(t*.37)*.12;
      keyLight.intensity=1.55+Math.sin(t*1.6)*.14+(Math.sin(t*8.2)>.985?-.65:0);
      if(mood==='cellar'||mood==='figure')keyLight.intensity*=.72;
      glass.rotation.z=Math.sin(t*1.2)*.025;
      cassette.rotation.y=Math.sin(t*.8)*.025;
      const dp=dust.geometry.attributes.position;
      for(let i=0;i<dp.count;i++){let y=dp.getY(i)+dt*(.08+((i%7)*.012));if(y>4.8)y=-.1;dp.setY(i,y);dp.setX(i,dp.getX(i)+Math.sin(t*.2+i)*dt*.012);}dp.needsUpdate=true;
      const rp=rain.geometry.attributes.position;
      for(let i=0;i<rp.count;i++){let y=rp.getY(i)-dt*(2.1+(i%5)*.25);if(y<-.2)y=5;rp.setY(i,y);rp.setX(i,-4+((i*17+t*.25)%2));}rp.needsUpdate=true;
      rain.visible=mood!=='cellar'&&mood!=='paper';
      renderer.render(scene,camera);
    }
    // Optional generative ambience: low, slowly beating tones plus filtered rain-like noise.
    let audioContext=null, ambienceGain=null, droneA=null, droneB=null, noiseSource=null;
    function ambience(on){
      try{
        if(!audioContext){
          audioContext=new (window.AudioContext||window.webkitAudioContext)();
          ambienceGain=audioContext.createGain();ambienceGain.gain.value=0;ambienceGain.connect(audioContext.destination);
          const filter=audioContext.createBiquadFilter();filter.type='lowpass';filter.frequency.value=420;filter.Q.value=.6;filter.connect(ambienceGain);
          droneA=audioContext.createOscillator();droneA.type='sine';droneA.frequency.value=43;const ga=audioContext.createGain();ga.gain.value=.35;droneA.connect(ga);ga.connect(filter);droneA.start();
          droneB=audioContext.createOscillator();droneB.type='triangle';droneB.frequency.value=43.7;const gb=audioContext.createGain();gb.gain.value=.14;droneB.connect(gb);gb.connect(filter);droneB.start();
          const buffer=audioContext.createBuffer(1,audioContext.sampleRate*2,audioContext.sampleRate),data=buffer.getChannelData(0);
          for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.18;
          noiseSource=audioContext.createBufferSource();noiseSource.buffer=buffer;noiseSource.loop=true;
          const noiseFilter=audioContext.createBiquadFilter();noiseFilter.type='lowpass';noiseFilter.frequency.value=650;
          const ng=audioContext.createGain();ng.gain.value=.11;noiseSource.connect(noiseFilter);noiseFilter.connect(ng);ng.connect(ambienceGain);noiseSource.start();
        }
        if(audioContext.state==='suspended')audioContext.resume();
        ambienceGain.gain.cancelScheduledValues(audioContext.currentTime);
        ambienceGain.gain.setTargetAtTime(on ? .025 : 0,audioContext.currentTime,.65);
      }catch(e){/* audio is optional; the story remains playable */}
    }
    document.getElementById('sound')?.addEventListener('click',()=>{
      const on=document.getElementById('sound')?.classList.contains('on');
      ambience(on);
    });
    animate();
    window.addEventListener('pagehide',()=>{alive=false;if(raf)cancelAnimationFrame(raf);renderer?.dispose();});
  } catch (error) {
    console.warn('DEAD AIR 3D scene unavailable; cinematic CSS scene remains active.', error);
    if(renderer?.domElement)renderer.domElement.remove();
  }
})();