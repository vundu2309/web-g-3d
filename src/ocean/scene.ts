import * as T from "three";
import { islands, type Boat, type Pose } from "./model";

const colors = [0x287bd1, 0xef866a, 0xe6bc45, 0x56ad9a];
export class OceanScene {
  private renderer: T.WebGLRenderer;
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(52, 1, 0.1, 900);
  private fleet = new Map<
    string,
    { mesh: T.Group; label: HTMLElement; pose: Pose }
  >();
  private observer: ResizeObserver;
  private time = { value: 0 };
  private lost = false;
  private contextLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
    this.onLost();
  };
  private contextRestored = () => {
    this.lost = false;
  };
  constructor(
    private host: HTMLElement,
    private onLost: () => void,
  ) {
    this.renderer = new T.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "low-power",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Biển chung 3D, mỗi người chơi một thuyền",
    );
    this.host.append(this.renderer.domElement);
    this.renderer.domElement.addEventListener(
      "webglcontextlost",
      this.contextLost,
    );
    this.renderer.domElement.addEventListener(
      "webglcontextrestored",
      this.contextRestored,
    );
    this.scene.background = new T.Color(0xdceeff);
    this.scene.fog = new T.Fog(0xdceeff, 140, 430);
    this.scene.add(new T.HemisphereLight(0xffffff, 0x527b98, 2.8));
    const sun = new T.DirectionalLight(0xffedce, 3);
    sun.position.set(-40, 70, -30);
    this.scene.add(sun);
    const water = new T.ShaderMaterial({
      uniforms: { time: this.time },
      vertexShader: `uniform float time; varying vec3 world; varying float wave;
        void main(){ vec3 p=position; p.z=sin(p.x*.16+time*1.2)*.18+cos(p.y*.22+time)*.13;
        wave=p.z; vec4 w=modelMatrix*vec4(p,1.); world=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `varying vec3 world; varying float wave;
        void main(){ float ripple=sin(world.x*1.8+sin(world.z*.7)*2.+world.z*2.7+wave*7.)*cos(world.z*1.25-world.x*.48);
        vec3 c=mix(vec3(.035,.35,.57),vec3(.16,.63,.78),smoothstep(-.32,.3,wave));
        c=mix(c,vec3(.66,.89,.94),pow(max(0.,ripple),18.)*.22);
        float fog=smoothstep(100.,430.,length(cameraPosition-world));
        gl_FragColor=vec4(mix(c,vec3(.78,.89,.98),fog),1.); }`,
    });
    const sea = new T.Mesh(new T.PlaneGeometry(1400, 1400, 180, 180), water);
    sea.rotation.x = -Math.PI / 2;
    this.scene.add(sea);
    for (const island of islands) {
      const sand = new T.Mesh(
        new T.CylinderGeometry(island.radius * 0.8, island.radius, 3, 12),
        new T.MeshStandardMaterial({ color: 0xf4dda1, flatShading: true }),
      );
      sand.position.set(island.x, 0, island.z);
      this.scene.add(sand);
      const hill = new T.Mesh(
        new T.ConeGeometry(island.radius * 0.85, 14, 7),
        new T.MeshStandardMaterial({ color: 0x83b990, flatShading: true }),
      );
      hill.position.set(island.x, 7, island.z);
      this.scene.add(hill);
      for (let i = 0; i < 3; i++) {
        const tree = new T.Mesh(
          new T.ConeGeometry(3, 9, 6),
          new T.MeshStandardMaterial({ color: 0x438e74 }),
        );
        tree.position.set(island.x + (i - 1) * 5, 14, island.z);
        this.scene.add(tree);
      }
    }
    // A visible buoy ring gives the open sea a quiet point of reference.
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      const buoy = new T.Mesh(
        new T.ConeGeometry(0.65, 1.8, 8),
        new T.MeshStandardMaterial({ color: i % 2 ? 0xffffff : 0xef866a }),
      );
      buoy.position.set(Math.cos(angle) * 10, 0.7, -35 + Math.sin(angle) * 10);
      this.scene.add(buoy);
    }
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
  }
  private resize() {
    const { width, height } = this.host.getBoundingClientRect();
    this.renderer.setSize(Math.max(width, 1), Math.max(height, 1));
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }
  private boat(color: number) {
    const group = new T.Group();
    const wood = new T.MeshStandardMaterial({
      color: 0xb77d49,
      flatShading: true,
      side: T.DoubleSide,
    });
    const white = new T.MeshStandardMaterial({
      color: 0xfff7dd,
      flatShading: true,
    });
    const paint = new T.MeshStandardMaterial({ color, flatShading: true });
    const ink = new T.MeshStandardMaterial({ color: 0x214876 });
    const add = (
      geometry: T.BufferGeometry,
      material: T.Material,
      x: number,
      y: number,
      z: number,
    ) => {
      const mesh = new T.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      group.add(mesh);
      return mesh;
    };
    const outline = new T.Shape();
    outline.moveTo(-1.35, 2.6);
    outline.lineTo(-1.55, -1.9);
    outline.quadraticCurveTo(-1.2, -3.3, 0, -4);
    outline.quadraticCurveTo(1.2, -3.3, 1.55, -1.9);
    outline.lineTo(1.35, 2.6);
    outline.closePath();
    const hull = add(
      new T.ExtrudeGeometry(outline, { depth: 1.1, bevelEnabled: false }),
      paint,
      0,
      1.35,
      0,
    );
    hull.rotation.x = Math.PI / 2;
    const deck = add(new T.ShapeGeometry(outline), wood, 0, 1.38, 0);
    deck.rotation.x = Math.PI / 2;
    add(new T.BoxGeometry(2.35, 1.8, 2.1), white, 0, 2.3, 0.7);
    add(new T.BoxGeometry(2.75, 0.2, 2.5), paint, 0, 3.3, 0.7);
    add(new T.BoxGeometry(1.8, 0.7, 0.04), ink, 0, 2.6, -0.37);
    add(new T.BoxGeometry(1.7, 0.7, 0.04), ink, 0, 2.6, 1.77);
    for (const x of [-1.43, 1.43])
      add(new T.BoxGeometry(0.1, 0.45, 4.3), wood, x, 1.6, 0.1);
    add(new T.BoxGeometry(2.6, 0.45, 0.1), wood, 0, 1.6, 2.55);
    add(new T.BoxGeometry(0.04, 0.7, 1.2), ink, -1.19, 2.6, 0.7);
    add(new T.BoxGeometry(0.04, 0.7, 1.2), ink, 1.19, 2.6, 0.7);
    add(new T.CylinderGeometry(0.055, 0.055, 3.5, 6), wood, 0, 4.5, 1.5);
    const flag = add(
      new T.PlaneGeometry(0.85, 0.5),
      new T.MeshStandardMaterial({ color: 0xffd35a, side: T.DoubleSide }),
      0.43,
      5.8,
      1.5,
    );
    flag.rotation.y = 0.2;
    for (const x of [-1.5, 1.5])
      for (const z of [-1.5, 1.3]) {
        const tire = add(new T.TorusGeometry(0.35, 0.12, 6, 12), ink, x, 1, z);
        tire.rotation.y = Math.PI / 2;
      }
    add(new T.BoxGeometry(1, 0.5, 0.9), wood, 0, 1.65, -1.8);
    const rod = add(
      new T.CylinderGeometry(0.035, 0.06, 3, 6),
      wood,
      1.2,
      2.5,
      -1.3,
    );
    rod.rotation.z = -0.55;
    const line = add(
      new T.CylinderGeometry(0.012, 0.012, 2.6, 4),
      white,
      2,
      1.5,
      -1.3,
    );
    line.name = "fishing-line";
    line.visible = false;
    const wake = add(
      new T.CircleGeometry(1.6, 16),
      new T.MeshBasicMaterial({
        color: 0xd8f6ff,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
      }),
      0,
      0.03,
      2.5,
    );
    wake.rotation.x = -Math.PI / 2;
    wake.scale.y = 2;
    return group;
  }
  update(
    boats: Boat[],
    uid: string,
    self: Pose,
    time: number,
    dt: number,
    reducedMotion: boolean,
  ) {
    if (this.lost) return;
    this.time.value = reducedMotion ? 0 : time;
    const present = new Set(boats.map((boat) => boat.uid));
    for (const [id, item] of this.fleet)
      if (!present.has(id)) {
        this.scene.remove(item.mesh);
        this.free(item.mesh);
        item.label.remove();
        this.fleet.delete(id);
      }
    for (const boat of boats) {
      let item = this.fleet.get(boat.uid);
      const target = boat.uid === uid ? self : boat;
      if (!item) {
        let hash = 0;
        for (const char of boat.uid) hash += char.charCodeAt(0);
        const mesh = this.boat(
          boat.uid === uid ? colors[0]! : colors[hash % colors.length]!,
        );
        mesh.position.set(target.x, 0, target.z);
        mesh.rotation.y = -target.heading;
        const label = document.createElement("span");
        label.className = "ocean-boat-label";
        label.textContent = boat.uid === uid ? "Bạn" : boat.name;
        label.dataset.uid = boat.uid;
        if (boat.uid === uid) label.classList.add("is-self");
        this.host.append(label);
        this.scene.add(mesh);
        item = { mesh, label, pose: target };
        this.fleet.set(boat.uid, item);
      }
      item.pose = target;
      item.label.dataset.x = String(target.x);
      item.label.dataset.z = String(target.z);
      const blend = boat.uid === uid ? 1 : Math.min(1, dt * 6);
      item.mesh.position.x = T.MathUtils.lerp(
        item.mesh.position.x,
        target.x,
        blend,
      );
      item.mesh.position.z = T.MathUtils.lerp(
        item.mesh.position.z,
        target.z,
        blend,
      );
      const delta = Math.atan2(
        Math.sin(-target.heading - item.mesh.rotation.y),
        Math.cos(-target.heading - item.mesh.rotation.y),
      );
      item.mesh.rotation.y += delta * blend;
      item.mesh.position.y = reducedMotion
        ? 0
        : Math.sin(time * 1.6 + target.x) * 0.12;
      item.mesh.rotation.z = reducedMotion
        ? 0
        : Math.sin(time * 1.2 + target.z) * 0.025;
      item.mesh.getObjectByName("fishing-line")!.visible = target.fishing;
    }
    const behind = new T.Vector3(
      self.x - Math.sin(self.heading) * 22 + Math.cos(self.heading) * 7,
      10,
      self.z + Math.cos(self.heading) * 22 + Math.sin(self.heading) * 7,
    );
    this.camera.position.lerp(
      behind,
      this.time.value < 0.1 ? 1 : Math.min(1, dt * 4),
    );
    this.camera.lookAt(
      self.x + Math.sin(self.heading) * 4,
      1,
      self.z - Math.cos(self.heading) * 4,
    );
    this.renderer.render(this.scene, this.camera);
    for (const item of this.fleet.values()) {
      const p = new T.Vector3(
        item.mesh.position.x,
        6.5,
        item.mesh.position.z,
      ).project(this.camera);
      item.label.hidden =
        p.z > 1 || p.z < -1 || Math.abs(p.x) > 0.95 || Math.abs(p.y) > 0.95;
      item.label.style.left = `${(p.x * 0.5 + 0.5) * 100}%`;
      item.label.style.top = `${(-p.y * 0.5 + 0.5) * 100}%`;
    }
  }
  private free(object: T.Object3D) {
    const materials = new Set<T.Material>();
    object.traverse((node) => {
      if (node instanceof T.Mesh) {
        node.geometry.dispose();
        for (const material of Array.isArray(node.material)
          ? node.material
          : [node.material])
          materials.add(material);
      }
    });
    materials.forEach((material) => material.dispose());
  }
  dispose() {
    this.observer.disconnect();
    this.renderer.domElement.removeEventListener(
      "webglcontextlost",
      this.contextLost,
    );
    this.renderer.domElement.removeEventListener(
      "webglcontextrestored",
      this.contextRestored,
    );
    for (const item of this.fleet.values()) item.label.remove();
    this.fleet.clear();
    this.free(this.scene);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.host.replaceChildren();
  }
}
