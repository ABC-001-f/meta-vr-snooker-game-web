import * as THREE from 'three';

// Reads Quest hand tracking (and controllers as a fallback) into two plain
// "input" records the rest of the game uses, and draws the player's hands as
// white referee's gloves with dark sleeves.
const FINGERS = ['thumb', 'index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];
const JOINTS = ['wrist'];
const BONES = [];
for (const f of FINGERS) {
  const parts = f === 'thumb'
    ? ['metacarpal', 'phalanx-proximal', 'phalanx-distal', 'tip']
    : ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'];
  let prev = 'wrist';
  for (const p of parts) {
    const name = `${f}-${p}`;
    JOINTS.push(name);
    BONES.push([prev, name]);
    prev = name;
  }
}
// webbing across the knuckles so the palm reads as solid
for (let i = 1; i < FINGERS.length - 1; i++) {
  BONES.push([`${FINGERS[i]}-phalanx-proximal`, `${FINGERS[i + 1]}-phalanx-proximal`]);
  BONES.push([`${FINGERS[i]}-metacarpal`, `${FINGERS[i + 1]}-metacarpal`]);
}
BONES.push(['thumb-phalanx-proximal', 'index-finger-phalanx-proximal']);

class Euro3 {
  // One-euro filter: steady when the hand is still, quick when it moves.
  constructor(minCut = 1.3, beta = 9) { this.minCut = minCut; this.beta = beta; this.x = null; this.dx = new THREE.Vector3(); this.out = new THREE.Vector3(); }
  reset() { this.x = null; }
  filter(v, dt) {
    if (!this.x || dt <= 0) { this.x = v.clone(); this.dx.set(0, 0, 0); return this.out.copy(v); }
    const alpha = (cut) => 1 / (1 + 1 / (2 * Math.PI * cut * dt));
    const ad = alpha(1.0);
    for (const k of ['x', 'y', 'z']) {
      const d = (v[k] - this.x[k]) / dt;
      this.dx[k] += (d - this.dx[k]) * ad;
      const a = alpha(this.minCut + this.beta * Math.abs(this.dx[k]));
      this.x[k] += (v[k] - this.x[k]) * a;
    }
    return this.out.copy(this.x);
  }
}

function makeInput(index) {
  return {
    index, tracked: false, isHand: false, handedness: 'none', autoGrab: false,
    grip: new THREE.Vector3(), gripRaw: new THREE.Vector3(), bridge: new THREE.Vector3(),
    grab: false, pinch: false, pinchPoint: new THREE.Vector3(), pinchLocal: new THREE.Vector3(),
    palmUp: false, palm: new THREE.Vector3(),
    hasRay: false, rayOrigin: new THREE.Vector3(), rayDir: new THREE.Vector3(0, 0, -1),
    selectStarted: false, selectEnded: false, selecting: false,
  };
}

class HandVisual {
  constructor(rig) {
    const glove = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.8, metalness: 0 });
    this.joints = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), glove, JOINTS.length + 1);
    this.bones = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 10, 1, true), glove, BONES.length);
    this.sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.046, 0.26, 16), new THREE.MeshStandardMaterial({ color: 0x121217, roughness: 0.7 }));
    this.cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.037, 0.03, 16), new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 1 }));
    this.group = new THREE.Group();
    for (const m of [this.joints, this.bones, this.sleeve, this.cuff]) { m.frustumCulled = false; m.castShadow = true; this.group.add(m); }
    this.group.visible = false;
    rig.add(this.group);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3();
    this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._up = new THREE.Vector3(0, 1, 0);
  }

  update(hand) {
    const J = hand.joints;
    JOINTS.forEach((name, i) => {
      const j = J[name];
      const r = (j.jointRadius || 0.008) * 1.08;
      this._m.makeScale(r, r, r).setPosition(j.position);
      this.joints.setMatrixAt(i, this._m);
    });
    // palm pad
    const w = J['wrist'], mk = J['middle-finger-phalanx-proximal'];
    this._a.copy(w.position).lerp(mk.position, 0.55);
    this._m.compose(this._a, w.quaternion, this._s.set(0.038, 0.013, 0.042));
    this.joints.setMatrixAt(JOINTS.length, this._m);
    BONES.forEach(([n1, n2], i) => {
      const a = J[n1], b = J[n2];
      this._a.subVectors(b.position, a.position);
      const len = this._a.length() || 1e-5;
      this._q.setFromUnitVectors(this._up, this._a.divideScalar(len));
      const r = Math.min(a.jointRadius || 0.008, b.jointRadius || 0.008) * 1.02;
      this._b.addVectors(a.position, b.position).multiplyScalar(0.5);
      this._m.compose(this._b, this._q, this._s.set(r, len, r));
      this.bones.setMatrixAt(i, this._m);
    });
    this.joints.instanceMatrix.needsUpdate = true;
    this.bones.instanceMatrix.needsUpdate = true;
    // sleeve runs back from the wrist
    this._a.subVectors(w.position, mk.position).normalize();
    this._q.setFromUnitVectors(this._up, this._a);
    this.sleeve.quaternion.copy(this._q); this.cuff.quaternion.copy(this._q);
    this.sleeve.position.copy(w.position).addScaledVector(this._a, 0.15);
    this.cuff.position.copy(w.position).addScaledVector(this._a, 0.025);
  }
}

export class XRInputs {
  constructor(renderer, rig) {
    this.rig = rig;
    this.inputs = [makeInput(0), makeInput(1)];
    this.slots = [];
    const wandGeo = new THREE.CylinderGeometry(0.012, 0.016, 0.12, 12);
    wandGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 2; i++) {
      const slot = {
        controller: renderer.xr.getController(i),
        gripSpace: renderer.xr.getControllerGrip(i),
        hand: renderer.xr.getHand(i),
        source: null, visual: new HandVisual(rig), squeezing: false,
        gripF: new Euro3(1.3, 9), bridgeF: new Euro3(1.3, 9), grabState: false,
      };
      const inp = this.inputs[i];
      slot.controller.addEventListener('connected', (e) => { slot.source = e.data; inp.handedness = e.data.handedness; });
      slot.controller.addEventListener('disconnected', () => { slot.source = null; inp.tracked = false; });
      slot.controller.addEventListener('selectstart', () => { inp.selecting = true; inp.selectStarted = true; });
      slot.controller.addEventListener('selectend', () => { inp.selecting = false; inp.selectEnded = true; });
      slot.controller.addEventListener('squeezestart', () => { slot.squeezing = true; });
      slot.controller.addEventListener('squeezeend', () => { slot.squeezing = false; });
      slot.wand = new THREE.Mesh(wandGeo, new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.6 }));
      slot.gripSpace.add(slot.wand);
      rig.add(slot.controller, slot.gripSpace, slot.hand);
      this.slots.push(slot);
    }
    this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._q = new THREE.Quaternion();
  }

  // Call once per frame before using inputs. Clears edge flags afterwards via endFrame().
  update(dt) {
    const rig = this.rig;
    rig.updateMatrixWorld(true);
    const M = rig.matrixWorld;
    for (let i = 0; i < 2; i++) {
      const s = this.slots[i], inp = this.inputs[i];
      const J = s.hand.joints;
      const wrist = J && J['wrist'];
      const handOk = !!(s.source && s.source.hand && s.hand.visible && wrist && wrist.visible && J['index-finger-tip'] && J['pinky-finger-tip']);
      const ctrlOk = !handOk && !!(s.source && !s.source.hand && s.gripSpace.visible);
      s.visual.group.visible = handOk;
      s.wand.visible = ctrlOk;
      inp.tracked = handOk || ctrlOk;
      inp.isHand = handOk;
      if (!inp.tracked) { s.gripF.reset(); s.bridgeF.reset(); inp.grab = false; s.grabState = false; inp.hasRay = false; continue; }

      if (handOk) {
        s.visual.update(s.hand);
        const thumb = J['thumb-tip'].position, index = J['index-finger-tip'].position;
        const pinchD = thumb.distanceTo(index);
        const palm = this._v.copy(wrist.position).lerp(J['middle-finger-phalanx-proximal'].position, 0.6);
        let curl = 0;
        for (const f of ['middle-finger', 'ring-finger', 'pinky-finger']) curl += J[`${f}-tip`].position.distanceTo(palm);
        curl /= 3;
        // hysteresis: close to grab, open clearly to let go
        if (!s.grabState && (pinchD < 0.022 || curl < 0.055)) s.grabState = true;
        else if (s.grabState && pinchD > 0.05 && curl > 0.08) s.grabState = false;
        inp.grab = s.grabState;
        inp.pinch = pinchD < 0.022;
        inp.palm.copy(palm).applyMatrix4(M);
        // where a held cue sits in the hand
        const g = this._v2.copy(thumb).add(J['index-finger-phalanx-intermediate'].position).add(J['middle-finger-phalanx-intermediate'].position).multiplyScalar(1 / 3);
        inp.gripRaw.copy(g).applyMatrix4(M);
        inp.grip.copy(s.gripF.filter(g, dt)).applyMatrix4(M);
        // the V of a bridge hand: between thumb and the index knuckle
        const br = this._v2.copy(J['thumb-phalanx-distal'].position).add(J['index-finger-phalanx-proximal'].position).multiplyScalar(0.5);
        br.y += 0.012;
        inp.bridge.copy(s.bridgeF.filter(br, dt)).applyMatrix4(M);
        inp.pinchLocal.copy(thumb).add(index).multiplyScalar(0.5);
        inp.pinchPoint.copy(inp.pinchLocal).applyMatrix4(M);
        // palm faces up when the wrist's +Y (back of the hand) points down
        const q = wrist.quaternion;
        inp.palmUp = 1 - 2 * (q.x * q.x + q.z * q.z) < -0.72 && curl > 0.085 && pinchD > 0.05;
      } else {
        const gp = s.source.gamepad;
        const trig = gp && gp.buttons[0] ? gp.buttons[0].pressed : inp.selecting;
        const sq = gp && gp.buttons[1] ? gp.buttons[1].pressed : s.squeezing;
        inp.grab = sq || trig;
        inp.pinch = trig;
        inp.palmUp = false;
        const p = s.gripSpace.position;
        inp.gripRaw.copy(p).applyMatrix4(M);
        inp.grip.copy(s.gripF.filter(p, dt)).applyMatrix4(M);
        inp.bridge.copy(s.bridgeF.filter(p, dt)).applyMatrix4(M);
        inp.pinchLocal.copy(p);
        inp.pinchPoint.copy(inp.gripRaw);
        inp.palm.copy(inp.gripRaw);
      }
      inp.hasRay = s.controller.visible;
      if (inp.hasRay) {
        inp.rayOrigin.copy(s.controller.position).applyMatrix4(M);
        this._q.copy(rig.quaternion).multiply(s.controller.quaternion);
        inp.rayDir.set(0, 0, -1).applyQuaternion(this._q).normalize();
      }
    }
    return this.inputs;
  }

  endFrame() {
    for (const inp of this.inputs) { inp.selectStarted = false; inp.selectEnded = false; }
  }
}
