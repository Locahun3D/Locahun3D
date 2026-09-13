// Standalone walk collision core. No renderer, scene, input, or persistence dependencies.
(() => {
  'use strict';
  const MAX_COORD = 10000;
  const MAX_CELLS = 100000;
  const MAX_CANDIDATES = 250000;
  const MAX_POINTS = 5000000;
  const MAX_TRIANGLES = 1000000;
  const ENV_GROUPS = 0x00010002;
  const QUERY_GROUPS = 0x00020001;
  const initialized = new WeakMap();
  let embedded;
  const webRapier = Object.freeze({
    path: '/vendor/rapier-0.20.0-09a000bee2ad8276.mjs', bytes: 2857590,
    sha256: '09a000bee2ad827608780cf8821258cadc243aaeb8881ab3e769de73f945eee0',
  });

  function finite(n, label, limit = MAX_COORD) {
    if (!Number.isFinite(n) || Math.abs(n) > limit)
      throw new RangeError(`Walk collision: ${label} must be finite and within bounds +/-${limit}.`);
    return n;
  }
  function vector(v, label) {
    if (!v) throw new TypeError(`Walk collision: ${label} requires x, y, z.`);
    return { x: finite(v.x, label), y: finite(v.y, label), z: finite(v.z, label) };
  }
  function typed(a, name) {
    return ArrayBuffer.isView(a) && Object.prototype.toString.call(a) === `[object ${name}]`;
  }
  async function initialize(module) {
    const r = module?.World ? module : module?.default;
    if (!r || typeof r.World !== 'function' || typeof r.init !== 'function')
      throw new TypeError('Walk collision: inject the Rapier compat module via create({ rapier }).');
    if (!initialized.has(r)) {
      const pending = Promise.resolve().then(() => r.init()).then(() => r);
      initialized.set(r, pending);
      pending.catch(() => initialized.delete(r));
    }
    return initialized.get(r);
  }
  async function fetchWebRapier() {
    const asset = globalThis.WALK_RAPIER_ASSET, location = globalThis.location;
    if (!asset || asset.bytes !== webRapier.bytes || asset.sha256 !== webRapier.sha256 ||
        !location || !['http:', 'https:'].includes(location.protocol) || globalThis.isSecureContext === false)
      throw new Error('Walk collision: missing or invalid HTTP Rapier descriptor; use the full standalone HTML offline.');
    const base = new URL(location.origin), url = new URL(asset.url, base);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
    if ((base.protocol !== 'https:' && !loopback) || url.origin !== base.origin ||
        url.pathname !== webRapier.path || url.search || url.hash || url.username || url.password)
      throw new Error('Walk collision: untrusted Rapier module URL.');
    const abort = new AbortController();
    let timer, reader, complete = false;
    try {
      const loading = (async () => {
        const response = await fetch(url.href, { credentials: 'omit', redirect: 'error', signal: abort.signal });
        if (abort.signal.aborted) {
          response.body?.cancel().catch(() => {});
          throw new Error('Rapier module load timed out.');
        }
        if (response.status !== 200 || !response.body) throw new Error('Rapier module request failed.');
        reader = response.body.getReader();
        const bytes = new Uint8Array(webRapier.bytes);
        let offset = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (offset + value.byteLength > bytes.length) throw new Error('Rapier module byte limit exceeded.');
          bytes.set(value, offset); offset += value.byteLength;
        }
        complete = true;
        if (offset !== bytes.length) throw new Error('Incomplete Rapier module.');
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
        if ([...digest].map(b => b.toString(16).padStart(2, '0')).join('') !== webRapier.sha256)
          throw new Error('Rapier module integrity mismatch.');
        return bytes;
      })();
      return await Promise.race([loading, new Promise((_, reject) => {
        timer = setTimeout(() => { abort.abort(); reject(new Error('Rapier module load timed out.')); }, 15000);
      })]);
    } finally {
      clearTimeout(timer); abort.abort();
      if (reader) {
        if (!complete) reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    }
  }
  async function loadEmbedded() {
    if (!embedded) {
      embedded = (async () => {
        const b64 = globalThis.WALK_RAPIER_B64;
        let url;
        try {
          let bytes;
          if (typeof b64 === 'string' && b64.length) {
            const binary = globalThis.atob(b64);
            bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          } else bytes = await fetchWebRapier();
          url = URL.createObjectURL(new Blob([bytes], { type: 'text/javascript' }));
          return await initialize(await import(url));
        } catch (error) {
          throw new Error(`Walk collision: Rapier could not load. Check asset integrity, network and blob:/WASM CSP permissions. ${error.message}`, { cause: error });
        } finally {
          if (url) URL.revokeObjectURL(url);
        }
      })();
      embedded.catch(() => { embedded = undefined; });
    }
    return embedded;
  }

  function character(world, r, feet, height, radius) {
    return world.createCollider(r.ColliderDesc.capsule(height / 2 - radius, radius)
      .setTranslation(feet.x, feet.y + height / 2, feet.z)
      .setSensor(true).setCollisionGroups(QUERY_GROUPS));
  }
  function controller(world) {
    const c = world.createCharacterController(0.01);
    c.setUp({ x: 0, y: 1, z: 0 });
    c.setSlideEnabled(true);
    c.setMaxSlopeClimbAngle(Math.PI / 4);
    c.setMinSlopeSlideAngle(Math.PI / 4);
    // Scan-derived risers leave less landing clearance than ideal box stairs.
    c.enableAutostep(0.3, 0.08, false);
    c.enableSnapToGround(0.2);
    c.setApplyImpulsesToDynamicBodies(false);
    return c;
  }

  globalThis.LocahunWalkCollision = class LocahunWalkCollision {
    static async create(options = {}) {
      const injection = options?.rapier || (options?.World ? options : null);
      return new this(injection ? await initialize(injection) : await loadEmbedded());
    }
    constructor(rapier) {
      if (!rapier) throw new Error('Walk collision: use await LocahunWalkCollision.create().');
      this._rapier = rapier;
      this._world = new rapier.World({ x: 0, y: 0, z: 0 });
      this._controller = controller(this._world);
      this._avatar = null;
      this._height = 1.7;
      this._radius = 0.22;
      this._tileIndex = null;
      this._tiles = new Map();
    }
    _alive() {
      if (!this._world) throw new Error('Walk collision: instance has been disposed. Create a new instance.');
    }
    rebuild({ boxes = [], meshes = [] } = {}) {
      this._alive();
      if (!Array.isArray(boxes) || !Array.isArray(meshes))
        throw new TypeError('Walk collision: boxes and meshes must be arrays.');
      if (boxes.length + meshes.length > MAX_CELLS)
        throw new RangeError(`Walk collision: collider limit ${MAX_CELLS} exceeded. Reduce geometry.`);
      let triangles = 0, vertices = 0;
      for (const b of boxes) {
        if (b?.center?.length !== 3 || b?.half?.length !== 3)
          throw new TypeError('Walk collision: each box needs center[3] and half[3].');
        for (let j = 0; j < 3; j++) {
          finite(b.center[j], 'box center');
          finite(b.half[j], 'box half');
          if (b.half[j] <= 0) throw new RangeError('Walk collision: box half extents must be positive.');
          finite(Math.abs(b.center[j]) + b.half[j], 'box outer bounds');
        }
      }
      for (const m of meshes) {
        if (!typed(m?.vertices, 'Float32Array') || m.vertices.length % 3 || m.vertices.length < 9)
          throw new TypeError('Walk collision: mesh vertices must be Float32Array xyz triples (at least 3 vertices).');
        if (!typed(m.indices, 'Uint32Array') || m.indices.length % 3 || !m.indices.length)
          throw new TypeError('Walk collision: mesh indices must be Uint32Array triangle triples.');
        triangles += m.indices.length / 3;
        vertices += m.vertices.length / 3;
        if (vertices > MAX_TRIANGLES * 3)
          throw new RangeError(`Walk collision: mesh vertex limit ${MAX_TRIANGLES * 3} exceeded across all meshes. Simplify geometry.`);
        if (triangles > MAX_TRIANGLES)
          throw new RangeError(`Walk collision: mesh limit ${MAX_TRIANGLES} triangles exceeded. Simplify geometry.`);
        for (const n of m.vertices) finite(n, 'mesh vertex');
        for (const index of m.indices)
          if (index >= m.vertices.length / 3) throw new RangeError('Walk collision: mesh index outside vertices.');
      }
      // Transactional replacement: invalid input or allocation failure keeps the old world alive.
      const r = this._rapier;
      const next = new r.World({ x: 0, y: 0, z: 0 });
      let nextController, nextAvatar;
      try {
        for (const b of boxes)
          next.createCollider(r.ColliderDesc.cuboid(...b.half).setTranslation(...b.center).setCollisionGroups(ENV_GROUPS));
        for (const m of meshes)
          next.createCollider(r.ColliderDesc.trimesh(m.vertices, m.indices, r.TriMeshFlags.FIX_INTERNAL_EDGES)
            .setCollisionGroups(ENV_GROUPS));
        nextController = controller(next);
        if (this._avatar) {
          const p = this._avatar.translation();
          nextAvatar = character(next, r, { x: p.x, y: p.y - this._height / 2, z: p.z }, this._height, this._radius);
        }
        // Rapier 0.20 uses the simulation broad phase for queries; step once after structural edits.
        next.step();
      } catch (error) {
        next.free();
        throw new Error(`Walk collision: geometry rebuild failed: ${error.message}`, { cause: error });
      }
      const old = this._world;
      this._world = next;
      this._controller = nextController;
      this._avatar = nextAvatar || null;
      this._tiles.clear();
      this._tileIndex=null;
      old.free();
    }
    setTileCoverage(index,bounds) {
      this._alive();
      const selected=index.query(bounds),wanted=new Map(),additions=[];
      const previous=this._tileIndex===index?this._tiles:new Map();
      for(const tile of selected){
        if(wanted.has(tile.id))throw new Error('Duplicate collision tile');
        if(previous.has(tile.id)){wanted.set(tile.id,previous.get(tile.id));continue;}
        const boxes=index.boxes(tile);
        if(!Array.isArray(boxes))throw new Error('Invalid collision tile boxes');
        for(const b of boxes){
          if(b?.center?.length!==3||b?.half?.length!==3)throw new Error('Invalid collision tile box');
          for(let i=0;i<3;i++){finite(b.center[i],'tile center');finite(b.half[i],'tile half');finite(Math.abs(b.center[i])+b.half[i],'tile bounds');if(b.half[i]<=0)throw new Error('Invalid collision tile extent');}
        }
        const entry={handles:[],boxes};wanted.set(tile.id,entry);additions.push(entry);
      }
      const removals=[...this._tiles].filter(([id,entry])=>wanted.get(id)!==entry).map(([,entry])=>entry);
      const adding=additions.reduce((n,e)=>n+e.boxes.length,0);
      const removing=removals.reduce((n,e)=>n+e.handles.length,0),transient=this._world.colliders.len()+adding;
      // Keep old tiles until allocation succeeds, with explicitly bounded overlap headroom.
      if(transient-removing>MAX_CELLS||transient>MAX_CELLS*2)throw new Error('Active collision tile limit exceeded');
      if(!adding&&!removals.length){this._tileIndex=index;this._tiles=wanted;return {added:0,removed:0};}
      const created=[];
      try{
        for(const entry of additions)for(const b of entry.boxes){
          const collider=this._world.createCollider(this._rapier.ColliderDesc.cuboid(...b.half).setTranslation(...b.center).setCollisionGroups(ENV_GROUPS));
          entry.handles.push(collider.handle);created.push(collider);
        }
      }catch(error){for(const collider of created)this._world.removeCollider(collider,false);throw error;}
      let removed=0;
      for(const entry of removals)for(const handle of entry.handles){const collider=this._world.getCollider(handle);if(collider){this._world.removeCollider(collider,false);removed++;}}
      for(const entry of additions)delete entry.boxes;
      this._tileIndex=index;this._tiles=wanted;
      this._world.step();
      return {added:created.length,removed};
    }
    setCharacter(feet, height = 1.7, radius = 0.22) {
      this._alive();
      const p = vector(feet, 'character feet');
      finite(height, 'height', 20); finite(radius, 'radius', 10);
      if (radius < 0.02 || height < radius * 2)
        throw new RangeError('Walk collision: height must be >= 2 * radius; radius must be >= 0.02m.');
      finite(p.y + height, 'character top');
      const next = character(this._world, this._rapier, p, height, radius);
      if (this._avatar) this._world.removeCollider(this._avatar, false);
      this._avatar = next;
      this._height = height;
      this._radius = radius;
      this._world.step();
    }
    move(delta, options = {}) {
      this._alive();
      if (!this._avatar) throw new Error('Walk collision: call setCharacter(feet) before move().');
      const d = vector(delta, 'movement');
      const p = this._avatar.translation();
      vector({ x: p.x + d.x, y: p.y + d.y, z: p.z + d.z }, 'movement destination');
      const c = this._controller;
      c.computeColliderMovement(this._avatar, d, this._rapier.QueryFilterFlags.EXCLUDE_SENSORS, QUERY_GROUPS);
      const actual = c.computedMovement();
      const position = { x: p.x + actual.x, y: p.y + actual.y, z: p.z + actual.z };
      let grounded=c.computedGrounded();
      this._avatar.setTranslation(position);
      // computedGrounded includes a predictive margin above the surface.
      // Only actual capsule support may clear the caller's falling velocity.
      if(grounded && options.requireSupport) {
        const r=this._rapier,hit=this._world.castShape(position,{x:0,y:0,z:0,w:1},{x:0,y:-1,z:0},
          this._avatar.shape,.01,.002,true,r.QueryFilterFlags.EXCLUDE_SENSORS,QUERY_GROUPS,this._avatar);
        grounded=!!hit && hit.normal1.y>.05;
      }
      const wanted=Math.hypot(d.x,d.z);
      if(grounded && d.y<=0 && wanted>1e-5 && (actual.x*d.x+actual.z*d.z)<wanted*wanted*.25) {
        const stepped=this._trySupportedStep(p,d,position,wanted);
        if(stepped)return stepped;
      }
      // Only static environment is queried; avatar is a sensor excluded from every query.
      // Its new transform is read directly by the controller, so no world.step per frame is needed.
      return { feet: { x: position.x, y: position.y - this._height / 2, z: position.z }, grounded };
    }
    _trySupportedStep(start,delta,fallback,wanted) {
      const c=this._controller;
      const sweep=d=>{
        c.computeColliderMovement(this._avatar,d,this._rapier.QueryFilterFlags.EXCLUDE_SENSORS,QUERY_GROUPS);
        const moved=c.computedMovement(),p=this._avatar.translation();
        this._avatar.setTranslation({x:p.x+moved.x,y:p.y+moved.y,z:p.z+moved.z});return moved;
      };
      const reject=()=>{
        this._avatar.setTranslation(start);
        c.computeColliderMovement(this._avatar,delta,this._rapier.QueryFilterFlags.EXCLUDE_SENSORS,QUERY_GROUPS);
        this._avatar.setTranslation(fallback);return null;
      };
      this._avatar.setTranslation(start);
      // Every leg of this fallback is swept; never teleport through a riser or ceiling.
      const lift=sweep({x:0,y:.3,z:0}).y;
      if(lift<.01)return reject();
      const across=sweep({x:delta.x,y:0,z:delta.z});
      sweep({x:0,y:-lift,z:0});
      const p=this._avatar.translation(),feet={x:p.x,y:p.y-this._height/2,z:p.z};
      if(!c.computedGrounded() || p.y<start.y || p.y-start.y>.3001 ||
        Math.hypot(across.x,across.z)<wanted*.8 || !this.isCapsuleClear(feet,this._height,this._radius))return reject();
      // A footprint tolerates isolated empty scan cells, not an unsupported landing.
      let supports=0;
      for(const lead of [.12,.24]) {
        let row=0;
        for(const side of [-this._radius*.5,0,this._radius*.5]) {
          const r=this._rapier,ray=new r.Ray({x:feet.x+(delta.x*lead+delta.z*side)/wanted,y:feet.y+.4,
            z:feet.z+(delta.z*lead-delta.x*side)/wanted},{x:0,y:-1,z:0});
          const hit=this._world.castRayAndGetNormal(ray,.5,true,r.QueryFilterFlags.EXCLUDE_SENSORS,QUERY_GROUPS,this._avatar);
          const rise=hit===null?Infinity:.4-hit.timeOfImpact;
          if(hit && hit.timeOfImpact>0 && hit.normal.y>=Math.SQRT1_2 && rise>=-.1 && rise<=.3)row++;
        }
        if(!row)return reject();supports+=row;
      }
      if(supports<3)return reject();
      return {feet,grounded:true};
    }
      reconcileFeet(feet,height=1.7,radius=.22,grounded=false) {
        const p=vector(feet,'replacement feet');
        if(!grounded)return null;
        const r=this._rapier,limit=.16;
        // Only the sole may be depenetrated; the upper body remains collision-checked.
        for(let lift=0;lift<=limit+.00001;lift+=.01) {
          const start={...p,y:p.y+lift};
          if(!this.isCapsuleClear(start,height,radius))continue;
          const hit=this._world.castShape({x:p.x,y:start.y+height/2,z:p.z},
            {x:0,y:0,z:0,w:1},{x:0,y:-1,z:0},new r.Capsule(height/2-radius,radius),
            .01,limit+lift,true,r.QueryFilterFlags.EXCLUDE_SENSORS,QUERY_GROUPS,this._avatar||undefined);
          if(!hit || hit.normal1.y<=.05)continue;
          const result={...p,y:start.y-hit.time_of_impact};
          if(Math.abs(result.y-p.y)>limit || !this.isCapsuleClear(result,height,radius))continue;
          // A stair nose gives a diagonal capsule normal; verify the actual tread separately.
          for(const [dx,dz] of [[0,0],[radius*.7,0],[-radius*.7,0],[0,radius*.7],[0,-radius*.7]]) {
            const floor=this._world.castRayAndGetNormal(new r.Ray({x:p.x+dx,y:result.y+.3,z:p.z+dz},
              {x:0,y:-1,z:0}),.6,true,r.QueryFilterFlags.EXCLUDE_SENSORS,QUERY_GROUPS,this._avatar||undefined);
            if(floor && floor.timeOfImpact>0 && floor.normal.y>=Math.SQRT1_2 &&
              Math.abs(.3-floor.timeOfImpact)<=.2)return result;
          }
        }
        return null;
      }
      isCapsuleClear(feet, height = 1.7, radius = 0.22) {
      this._alive();
      const p = vector(feet, 'capsule feet');
      finite(height, 'height', 20); finite(radius, 'radius', 10);
      if (radius < 0.02 || height < radius * 2)
        throw new RangeError('Walk collision: invalid capsule dimensions.');
      finite(p.y + height, 'capsule top');
      const r = this._rapier;
      // Permit touching surfaces within 0.1mm, without inflating the physical body.
      const shape = new r.Capsule(height / 2 - radius, radius - 0.0001);
      return this._world.intersectionWithShape(
        {x:p.x,y:p.y + height / 2,z:p.z}, {x:0,y:0,z:0,w:1}, shape,
        r.QueryFilterFlags.EXCLUDE_SENSORS, QUERY_GROUPS, this._avatar || undefined
      ) === null;
    }
    moveCamera(origin, displacement, radius = .15) {
      this._alive();
      const p=vector(origin,'camera origin'),delta=vector(displacement,'camera displacement');
      finite(radius,'camera radius',10);
      if(radius<.02)throw new RangeError('Camera radius must be at least 0.02m.');
      const r=this._rapier,shape=new r.Ball(radius),rotation={x:0,y:0,z:0,w:1};
      const sweep=d=>{
        const length=Math.hypot(d.x,d.y,d.z);if(length<1e-8)return;
        // Allow retreat from an initial overlap; Rapier still blocks deeper penetration.
        const hit=this._world.castShape(p,rotation,d,shape,0,1,false,
          r.QueryFilterFlags.EXCLUDE_SENSORS,QUERY_GROUPS,this._avatar||undefined);
        const fraction=hit?Math.max(0,Math.min(1,hit.time_of_impact-.002/length)):1;
        p.x+=d.x*fraction;p.y+=d.y*fraction;p.z+=d.z*fraction;
      };
      const target={x:p.x+delta.x,y:p.y+delta.y,z:p.z+delta.z};
      sweep(delta);
      // Sweep each remaining axis so wall sliding cannot tunnel through corners.
      for(const axis of ['x','y','z']){const d={x:0,y:0,z:0};d[axis]=target[axis]-p[axis];sweep(d);}
      return p;
    }
    raycast(origin, dir, maxDistance) {
      this._alive();
      const o = vector(origin, 'ray origin');
      const d = vector(dir, 'ray direction');
      finite(maxDistance, 'ray distance', MAX_COORD * 2);
      if (maxDistance < 0) throw new RangeError('Walk collision: ray distance must be nonnegative.');
      const length = Math.hypot(d.x, d.y, d.z);
      if (!length) throw new RangeError('Walk collision: ray direction must be nonzero.');
      const r = this._rapier;
      const ray = new r.Ray(o, { x: d.x / length, y: d.y / length, z: d.z / length });
      const hit = this._world.castRay(ray, maxDistance, true, r.QueryFilterFlags.EXCLUDE_SENSORS,
        QUERY_GROUPS, this._avatar || undefined);
      return hit ? hit.timeOfImpact : null;
    }
    raycastSurface(origin, dir, maxDistance) {
      this._alive();
      const o=vector(origin,'ray origin'),d=vector(dir,'ray direction');
      finite(maxDistance,'ray distance',MAX_COORD*2);
      if(maxDistance<0)throw new RangeError('Walk collision: ray distance must be nonnegative.');
      const length=Math.hypot(d.x,d.y,d.z);
      if(!length)throw new RangeError('Walk collision: ray direction must be nonzero.');
      const direction={x:d.x/length,y:d.y/length,z:d.z/length},r=this._rapier;
      const hit=this._world.castRayAndGetNormal(new r.Ray(o,direction),maxDistance,true,
        r.QueryFilterFlags.EXCLUDE_SENSORS,QUERY_GROUPS,this._avatar||undefined);
      if(!hit)return null;
      const distance=hit.timeOfImpact;
      return {distance,point:{x:o.x+direction.x*distance,y:o.y+direction.y*distance,z:o.z+direction.z*distance},
        normal:{x:hit.normal.x,y:hit.normal.y,z:hit.normal.z}};
    }
    dispose() {
      if (!this._world) return;
      this._world.free();
      this._world = null;
      this._controller = null;
      this._avatar = null;
      this._rapier = null;
    }
    static refineLocal(points, coarse, center) {
      const p=vector(center,'detail center'),radius=2,halfHeight=3,local=[];
      for(let i=0;i<points.length;i+=3) {
        const x=points[i],y=points[i+1],z=points[i+2];
        if((x-p.x)**2+(z-p.z)**2<=radius**2 && Math.abs(y-p.y)<=halfHeight)local.push(x,y,z);
      }
      if(!local.length)return {boxes:coarse,region:null};
      let fine;
      try {
        fine=this.mergeVerticalBoxes(this.voxelize(new Float32Array(local),
          {cellSize:.1,minPoints:2,maxCells:30000,maxCandidates:120000,fitHorizontalSurfaces:true}));
      } catch(e) {
        if(!/maxCells|maxCandidates/.test(e.message))throw e;
        return {boxes:coarse,region:null};
      }
      if(!fine.length)return {boxes:coarse,region:null};
      // Keep every boundary-straddling box, including walls outside the detail volume.
      const outside=coarse.filter(b=>Math.hypot(Math.abs(b.center[0]-p.x)+b.half[0],
        Math.abs(b.center[2]-p.z)+b.half[2])>radius || Math.abs(b.center[1]-p.y)+b.half[1]>halfHeight);
      if(outside.length+fine.length>30000)return {boxes:coarse,region:null};
      return {boxes:outside.concat(fine),region:{center:{...p},radius,halfHeight}};
    }
    static mergeVerticalBoxes(boxes) {
      const columns = new Map();
      for (const b of boxes) {
        const key = [b.center[0], b.center[2], b.half[0], b.half[2]].join(',');
        if (!columns.has(key)) columns.set(key, []);
        columns.get(key).push(b);
      }
      const result = [];
      for (const column of columns.values()) {
        column.sort((a,b) => (a.center[1]-a.half[1])-(b.center[1]-b.half[1]));
        let merged;
        for (const b of column) {
          const bottom = b.center[1]-b.half[1], top = b.center[1]+b.half[1];
          // Epsilon only joins floating-point roundoff, never a visible gap.
          if (merged && bottom <= merged.center[1]+merged.half[1]+1e-10) {
            const low = merged.center[1]-merged.half[1];
            const high = Math.max(top,merged.center[1]+merged.half[1]);
            merged.center[1]=(low+high)/2; merged.half[1]=(high-low)/2;
          } else {
            merged={center:[...b.center],half:[...b.half]}; result.push(merged);
          }
        }
      }
      return result;
    }
    static voxelize(points, { cellSize = 0.2, minPoints = 2, maxCells = 30000,
      maxCandidates, fitHorizontalSurfaces = false } = {}) {
      if (!typed(points, 'Float32Array') || points.length % 3)
        throw new TypeError('Walk collision: points must be Float32Array xyz triples (length multiple of 3).');
      if (!Number.isFinite(cellSize) || cellSize < 0.02 || cellSize > 10)
        throw new RangeError('Walk collision: cellSize must be finite, between 0.02 and 10 metres.');
      if (!Number.isSafeInteger(minPoints) || minPoints < 1 || minPoints > MAX_POINTS)
        throw new RangeError('Walk collision: minPoints must be an integer between 1 and 5000000.');
      if (!Number.isSafeInteger(maxCells) || maxCells < 1 || maxCells > MAX_CELLS)
        throw new RangeError(`Walk collision: maxCells must be an integer between 1 and ${MAX_CELLS}.`);
      if (maxCandidates !== undefined && (!Number.isSafeInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > MAX_CANDIDATES))
        throw new RangeError(`Walk collision: maxCandidates must be an integer between 1 and ${MAX_CANDIDATES}.`);
      if (typeof fitHorizontalSurfaces !== 'boolean')
        throw new TypeError('Walk collision: fitHorizontalSurfaces must be a boolean.');
      const candidateLimit = maxCandidates === undefined ? maxCells : maxCandidates;
      if (points.length / 3 > MAX_POINTS)
        throw new RangeError(`Walk collision: point limit ${MAX_POINTS} exceeded. Sample fewer points before voxelize().`);
      if (!points.length) return [];
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      let valid = 0;
      for (let i = 0; i < points.length; i += 3) {
        if (!Number.isFinite(points[i]) || !Number.isFinite(points[i + 1]) || !Number.isFinite(points[i + 2])) continue;
        valid++;
        for (let j = 0; j < 3; j++) {
          const n = finite(points[i + j], 'point bounds');
          min[j] = Math.min(min[j], n); max[j] = Math.max(max[j], n);
        }
      }
      if (!valid) throw new RangeError('Walk collision: no finite xyz points remain.');
      for (let j = 0; j < 3; j++) {
        if (max[j] - min[j] > 1000)
          throw new RangeError('Walk collision: point bounds span exceeds 1000m. Crop/sample a local region.');
        min[j] = Math.floor(min[j] / cellSize); max[j] = Math.floor(max[j] / cellSize);
        finite(min[j] * cellSize, 'voxel outer bounds');
        finite((max[j] + 1) * cellSize, 'voxel outer bounds');
      }
      const ny = max[1] - min[1] + 1, nz = max[2] - min[2] + 1;
      // Numeric keys avoid a string and coordinate array allocation for every occupied cell.
      const counts = new Map();
      // Optional fitting uses bounded packed storage, not six-number objects per candidate.
      const slots = Math.min(candidateLimit, valid);
      const bounds = fitHorizontalSurfaces ? new Float32Array(slots * 6) : null;
      const hits = fitHorizontalSurfaces ? new Uint32Array(slots) : null;
      const saturation = Math.max(minPoints, 8);
      for (let i = 0; i < points.length; i += 3) {
        const x = points[i], y = points[i + 1], z = points[i + 2];
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
        const key = ((Math.floor(x / cellSize) - min[0]) * ny + Math.floor(y / cellSize) - min[1]) * nz
          + Math.floor(z / cellSize) - min[2];
        let entry = counts.get(key);
        if (entry === undefined) {
          if (counts.size >= candidateLimit) {
            const label = maxCandidates === undefined ? 'maxCells' : 'maxCandidates';
            throw new RangeError(`Walk collision: ${label} (${candidateLimit}) exceeded before minPoints filtering. Increase cellSize or crop/sample fewer points.`);
          }
          if (bounds) {
            entry = counts.size;
            counts.set(key, entry);
            hits[entry] = 1;
            const offset = entry * 6;
            bounds[offset] = bounds[offset + 3] = x;
            bounds[offset + 1] = bounds[offset + 4] = y;
            bounds[offset + 2] = bounds[offset + 5] = z;
          } else counts.set(key, 1);
        } else if (bounds) {
          if (hits[entry] < saturation) hits[entry]++;
          const offset = entry * 6;
          // Extrema must include late observations even after the hit count saturates.
          bounds[offset] = Math.min(bounds[offset], x);
          bounds[offset + 1] = Math.min(bounds[offset + 1], y);
          bounds[offset + 2] = Math.min(bounds[offset + 2], z);
          bounds[offset + 3] = Math.max(bounds[offset + 3], x);
          bounds[offset + 4] = Math.max(bounds[offset + 4], y);
          bounds[offset + 5] = Math.max(bounds[offset + 5], z);
        } else if (entry < minPoints) counts.set(key, entry + 1);
      }
      const keys = [];
      for (const [key, entry] of counts) {
        if ((hits ? hits[entry] : entry) < minPoints) continue;
        if (keys.length >= maxCells)
          throw new RangeError(`Walk collision: maxCells (${maxCells}) exceeded after minPoints filtering. Increase cellSize or minPoints, or crop the input.`);
        keys.push(key);
      }
      if (!bounds) counts.clear();
      keys.sort((a, b) => a - b);
      const half = Object.freeze([cellSize / 2, cellSize / 2, cellSize / 2]);
      return keys.map(key => {
        const z = key % nz;
        const xy = (key - z) / nz;
        const y = xy % ny;
        const x = (xy - y) / ny;
        const center = [(x + min[0] + 0.5) * cellSize, (y + min[1] + 0.5) * cellSize,
          (z + min[2] + 0.5) * cellSize];
        if (bounds) {
          const entry = counts.get(key), offset = entry * 6;
          const spanY = bounds[offset + 4] - bounds[offset + 1];
          const spanX = bounds[offset + 3] - bounds[offset];
          const spanZ = bounds[offset + 5] - bounds[offset + 2];
          if (hits[entry] >= 4 && spanY < cellSize * 0.15 &&
            spanX >= cellSize * 0.25 && spanZ >= cellSize * 0.25) {
            const thickness = Math.max(0.02, spanY + 0.01);
            center[1] = bounds[offset + 4] + 0.005 - thickness / 2;
            finite(Math.abs(center[1]) + thickness / 2, 'fitted plate outer bounds');
            return { center, half: Object.freeze([half[0], thickness / 2, half[2]]) };
          }
          // Noisy shallow bands are not reliable thin planes. Only trim air ABOVE
          // every observation; preserve the entire cell base and horizontal barrier.
          if (hits[entry] >= 8 && spanX >= cellSize * 0.5 && spanZ >= cellSize * 0.5 &&
            spanY < Math.min(cellSize, spanX, spanZ) * 0.5) {
            const bottom = (y + min[1]) * cellSize;
            const top = Math.min(bottom + cellSize, Math.max(bottom + 0.02, bounds[offset + 4] + 0.005));
            const halfY = (top - bottom) / 2;
            center[1] = bottom + halfY;
            return { center, half: Object.freeze([half[0], halfY, half[2]]) };
          }
        }
        return { center, half };
      });
    }
  };
})();
