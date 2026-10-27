import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import SunCalc from "suncalc";
import type {
  Check,
  Design,
  DesignPatch,
  Project,
  Site,
} from "../domain/types";

type Props = {
  project: Project;
  checks: Check[];
  view: "3d" | "plan";
  hour: number;
  month: number;
  onMove: (patch: DesignPatch) => void;
};

type SceneRuntime = {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  perspective: THREE.PerspectiveCamera;
  plan: THREE.OrthographicCamera;
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  controls: OrbitControls;
  adu: THREE.Group;
  annotations: THREE.Group;
  light: THREE.DirectionalLight;
  site: Site;
  dragging: boolean;
  resetCamera: () => void;
};

const COLORS = {
  paper: 0xf4f5f1,
  grass: 0xdce3d1,
  olive: 0x64745b,
  ochre: 0xb39152,
  ink: 0x424b41,
  timber: 0xc3a47f,
  roof: 0x454c48,
};

function disposeGroup(group: THREE.Object3D) {
  group.traverse((object) => {
    if (
      object instanceof THREE.Mesh ||
      object instanceof THREE.Line ||
      object instanceof THREE.Sprite
    ) {
      if ("geometry" in object) object.geometry?.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) {
        if ("map" in material)
          (material.map as THREE.Texture | null)?.dispose();
        material.dispose();
      }
    }
  });
}

function box(
  width: number,
  height: number,
  depth: number,
  color: THREE.ColorRepresentation,
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color, roughness: 0.88 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function line(
  points: THREE.Vector3[],
  color: THREE.ColorRepresentation,
  dashed = false,
) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = dashed
    ? new THREE.LineDashedMaterial({
        color,
        dashSize: 1.25,
        gapSize: 0.9,
        transparent: true,
        opacity: 0.55,
      })
    : new THREE.LineBasicMaterial({ color });
  const result = new THREE.Line(geometry, material);
  if (dashed) result.computeLineDistances();
  return result;
}

function label(text: string, width = 20, dark = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d")!;
  context.fillStyle = dark ? "#44513c" : "rgba(250,251,247,.94)";
  context.beginPath();
  context.roundRect(10, 20, 492, 86, 12);
  context.fill();
  let fontSize = 64;
  const setFont = () => {
    context.font = `500 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  };
  setFont();
  const measured = context.measureText(text).width;
  if (measured > 460) {
    fontSize = Math.floor((fontSize * 460) / measured);
    setFont();
  }
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = dark ? "#fff" : "#4b5547";
  context.fillText(text, 256, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
    transparent: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(width, width / 4, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function roof(width: number, depth: number, rise: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(0, rise);
  shape.lineTo(width / 2, 0);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
  });
  geometry.translate(0, 0, -depth / 2);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: COLORS.roof, roughness: 0.95 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeBuilding(design: Design, main = false) {
  const group = new THREE.Group();
  const { width, depth, height } = design;
  const rise =
    design.roof === "gable" ? Math.min(width * 0.21, height * 0.27) : 0;
  const foundationTop = 0.425;
  const flatRoofThickness = design.roof === "flat" ? 0.65 : 0;
  // Declared height includes the foundation and the highest roof point.
  const wallHeight = height - rise - foundationTop - flatRoofThickness;
  const body = box(width, wallHeight, depth, main ? 0xf5f2e9 : COLORS.timber);
  body.position.set(width / 2, wallHeight / 2 + foundationTop, depth / 2);
  group.add(body);
  const foundation = box(width + 0.7, 0.45, depth + 0.7, 0xc7c9bf);
  foundation.position.set(width / 2, 0.2, depth / 2);
  group.add(foundation);
  if (design.roof === "gable") {
    const top = roof(width + 1.7, depth + 1.7, rise);
    top.position.set(width / 2, foundationTop + wallHeight, depth / 2);
    group.add(top);
  } else {
    const top = box(width + 1.4, 0.65, depth + 1.4, COLORS.roof);
    top.position.set(width / 2, height - flatRoofThickness / 2, depth / 2);
    group.add(top);
  }
  const glass = new THREE.MeshStandardMaterial({
    color: 0x8daba9,
    roughness: 0.32,
    metalness: 0.12,
  });
  const window = (x: number, z: number, rotation = 0) => {
    const frame = box(
      Math.min(width * 0.22, 5),
      Math.min(wallHeight * 0.36, 4.5),
      0.24,
      0xecebe3,
    );
    frame.position.set(x, wallHeight * 0.56, z);
    frame.rotation.y = rotation;
    group.add(frame);
    const pane = new THREE.Mesh(
      new THREE.BoxGeometry(
        Math.min(width * 0.22, 5) - 0.35,
        Math.min(wallHeight * 0.36, 4.5) - 0.35,
        0.27,
      ),
      glass.clone(),
    );
    pane.position.copy(frame.position);
    pane.rotation.y = rotation;
    group.add(pane);
  };
  window(width * 0.27, -0.15);
  window(width * 0.73, -0.15);
  window(width + 0.15, depth * 0.28, Math.PI / 2);
  window(width + 0.15, depth * 0.72, Math.PI / 2);
  window(width * 0.27, depth + 0.15);
  window(width * 0.73, depth + 0.15);
  glass.dispose();
  const door = box(
    3.4,
    Math.min(wallHeight * 0.67, 7.2),
    0.3,
    main ? 0x747e69 : 0x565c4d,
  );
  door.position.set(
    width * 0.5,
    Math.min(wallHeight * 0.67, 7.2) / 2 + 0.3,
    -0.18,
  );
  group.add(door);
  if (!main) {
    // Timber battens supply a readable facade without texture assets.
    for (let x = 0.6; x < width; x += 1.15) {
      const batten = box(0.07, wallHeight - 0.4, 0.08, 0xa58c6c);
      batten.position.set(x, wallHeight / 2 + 0.3, depth + 0.08);
      group.add(batten);
    }
    const terrace = box(width + 1, 0.2, 4.5, 0xc7bb9c);
    terrace.position.set(width / 2, 0.3, -2.3);
    group.add(terrace);
  }
  group.position.set(design.x, 0, design.z);
  return group;
}

function tree(x: number, z: number, scale = 1) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.65, 0.95, 7, 7),
    new THREE.MeshStandardMaterial({ color: 0x9f967e }),
  );
  trunk.position.y = 3.5;
  trunk.castShadow = true;
  group.add(trunk);
  const canopy = new THREE.Mesh(
    new THREE.IcosahedronGeometry(4.8, 1),
    new THREE.MeshStandardMaterial({
      color: 0x8c9d77,
      roughness: 1,
      flatShading: true,
    }),
  );
  canopy.position.y = 10;
  canopy.scale.set(1, 1.25, 1);
  canopy.castShadow = true;
  group.add(canopy);
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  return group;
}

function dimension(
  group: THREE.Group,
  from: THREE.Vector3,
  to: THREE.Vector3,
  text: string,
  color = COLORS.ink,
) {
  group.add(line([from, to], color));
  const direction = new THREE.Vector3().subVectors(to, from).normalize();
  const perpendicular = new THREE.Vector3(
    -direction.z,
    0,
    direction.x,
  ).multiplyScalar(0.8);
  for (const point of [from, to])
    group.add(
      line(
        [point.clone().add(perpendicular), point.clone().sub(perpendicular)],
        color,
      ),
    );
  const marker = label(text, text.length > 9 ? 22 : 20);
  marker.position
    .copy(from)
    .lerp(to, 0.5)
    .add(new THREE.Vector3(0, 0.5, 0));
  group.add(marker);
}

function addDesign(runtime: SceneRuntime, project: Project, checks: Check[]) {
  runtime.scene.remove(runtime.adu, runtime.annotations);
  disposeGroup(runtime.adu);
  disposeGroup(runtime.annotations);
  runtime.adu = makeBuilding(project.design);
  runtime.scene.add(runtime.adu);
  const { x, z, width, depth, height } = project.design;
  const anyFailure = checks.some((check) => check.outcome === "fail");
  const color = anyFailure ? 0xb7624b : COLORS.ochre;
  const annotations = new THREE.Group();
  annotations.add(
    line(
      [
        new THREE.Vector3(x - 0.45, 0.55, z - 0.45),
        new THREE.Vector3(x + width + 0.45, 0.55, z - 0.45),
        new THREE.Vector3(x + width + 0.45, 0.55, z + depth + 0.45),
        new THREE.Vector3(x - 0.45, 0.55, z + depth + 0.45),
        new THREE.Vector3(x - 0.45, 0.55, z - 0.45),
      ],
      color,
    ),
  );
  const formatFeet = (value: number) =>
    `${value.toFixed(1).replace(/\.0$/, "")} ft`;
  dimension(
    annotations,
    new THREE.Vector3(x, 0.75, z - 5),
    new THREE.Vector3(x + width, 0.75, z - 5),
    formatFeet(width),
    color,
  );
  dimension(
    annotations,
    new THREE.Vector3(x + width + 4, 0.75, z),
    new THREE.Vector3(x + width + 4, 0.75, z + depth),
    formatFeet(depth),
    color,
  );
  const name = label("PROPOSED ADU", 28, true);
  name.position.set(x + width / 2, height + 5.5, z + depth / 2);
  annotations.add(name);
  runtime.annotations = annotations;
  runtime.scene.add(annotations);
}

/** Interpret a selected clock time explicitly in Portland's local time zone. */
function portlandDate(month: number, hour: number) {
  const safeMonth = Math.min(12, Math.max(1, Math.round(month)));
  const safeHour = Math.min(23.99, Math.max(0, hour));
  const target = Date.UTC(
    2026,
    safeMonth - 1,
    15,
    Math.floor(safeHour),
    Math.round((safeHour % 1) * 60),
  );
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let utc = target;
  for (let iteration = 0; iteration < 3; iteration++) {
    const values = Object.fromEntries(
      format
        .formatToParts(new Date(utc))
        .map((part) => [part.type, part.value]),
    );
    const wallTime = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    );
    utc += target - wallTime;
  }
  return new Date(utc);
}

function updateSun(runtime: SceneRuntime, hour: number, month: number) {
  const { site, light } = runtime;
  const sun = SunCalc.getPosition(
    portlandDate(month, hour),
    site.latitude,
    site.longitude,
  );
  const direction = new THREE.Vector3(
    -Math.sin(sun.azimuth) * Math.cos(sun.altitude),
    Math.sin(sun.altitude),
    -Math.cos(sun.azimuth) * Math.cos(sun.altitude),
  );
  direction.applyAxisAngle(
    new THREE.Vector3(0, 1, 0),
    THREE.MathUtils.degToRad(-site.north),
  );
  light.position
    .copy(direction.multiplyScalar(170))
    .add(new THREE.Vector3(site.width / 2, 0, site.depth / 2));
  light.intensity = sun.altitude > 0 ? 2.4 : 0;
  light.visible = sun.altitude > 0;
}

function PlanFallback({
  project,
  onMove,
}: {
  project: Project;
  onMove: Props["onMove"];
}) {
  const { site, design } = project;
  return (
    <div
      style={{
        height: "100%",
        minHeight: 400,
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "#f4f5f1",
      }}
    >
      <div style={{ maxWidth: 420, width: "100%" }}>
        <svg
          viewBox={`-8 -8 ${site.width + 16} ${site.depth + 20}`}
          role="img"
          aria-label="Measured top-down site plan"
          style={{ width: "100%", maxHeight: 490, transform: "scaleY(-1)" }}
        >
          <rect
            width={site.width}
            height={site.depth}
            fill="#dce3d1"
            stroke="#64745b"
            strokeWidth=".4"
          />
          <rect
            x="5"
            y="5"
            width={site.width - 10}
            height={site.depth - 10}
            fill="none"
            stroke="#9aa48e"
            strokeWidth=".3"
            strokeDasharray="1 1"
          />
          <rect
            x={site.house.x}
            y={site.house.z}
            width={site.house.width}
            height={site.house.depth}
            fill="#f5f2e9"
            stroke="#687064"
            strokeWidth=".4"
          />
          <rect
            x={design.x}
            y={design.z}
            width={design.width}
            height={design.depth}
            fill="#c3a47f"
            stroke="#b39152"
            strokeWidth=".8"
          />
        </svg>
        <p style={{ fontSize: 12, color: "#61695e", textAlign: "center" }}>
          3D is unavailable on this device. The measured plan and design
          controls remain available.
        </p>
        <button
          type="button"
          onClick={() => onMove({ x: Math.max(0, design.x - 1) })}
          style={{
            display: "block",
            margin: "10px auto",
            padding: "7px 12px",
            border: "1px solid #d8ddd3",
            background: "#fff",
            borderRadius: 5,
          }}
        >
          Move ADU west 1 ft
        </button>
      </div>
    </div>
  );
}

export function SiteScene({
  project,
  checks,
  view,
  hour,
  month,
  onMove,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<SceneRuntime | null>(null);
  const compass = useRef<SVGSVGElement>(null);
  const latest = useRef({ project, checks, view, hour, month, onMove });
  latest.current = { project, checks, view, hour, month, onMove };
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      setFallback(true);
      return;
    }
    setFallback(false);
    const { site } = latest.current.project;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.domElement.style.cssText =
      "width:100%;height:100%;display:block;touch-action:none;outline:none;";
    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive 3D site model. Drag the proposed ADU to move it; drag the ground to orbit; scroll to zoom.",
    );
    renderer.domElement.setAttribute("role", "img");
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    // Project coordinates use +z toward north; Three.js uses -Z for north so
    // east remains screen-right in a north-up plan. Reflect the site, lights,
    // and their targets together, and convert pointer intersections below.
    scene.scale.z = -1;
    scene.background = new THREE.Color(COLORS.paper);
    const perspective = new THREE.PerspectiveCamera(34, 1, 0.1, 700);
    const plan = new THREE.OrthographicCamera(-70, 70, 70, -70, 0.1, 600);
    plan.position.set(site.width / 2, 190, -site.depth / 2);
    plan.up.set(0, 0, -1);
    plan.lookAt(site.width / 2, 0, -site.depth / 2);
    const controls = new OrbitControls(perspective, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 75;
    controls.maxDistance = 360;
    controls.minPolarAngle = 0.18;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.enablePan = false;
    const frontDirection = new THREE.Vector3(105, 145, 125).normalize();
    const fitCamera = (resetOrientation: boolean) => {
      const target = new THREE.Vector3(site.width / 2, 3, -site.depth / 2 + 2);
      const direction = resetOrientation
        ? frontDirection.clone()
        : perspective.position.clone().sub(controls.target).normalize();
      const right = new THREE.Vector3()
        .crossVectors(new THREE.Vector3(0, 1, 0), direction)
        .normalize();
      const up = new THREE.Vector3().crossVectors(direction, right).normalize();
      const verticalSlope = Math.tan(
        THREE.MathUtils.degToRad(perspective.fov / 2),
      );
      const horizontalSlope = verticalSlope * perspective.aspect;
      let distance = 235;
      // Fit the site, roof labels, and boundary measurements to the actual canvas.
      for (const x of [-8, site.width + 8])
        for (const y of [0, 32])
          for (const z of [-site.depth - 8, 10]) {
            const corner = new THREE.Vector3(x, y, z).sub(target);
            const towardCamera = corner.dot(direction);
            distance = Math.max(
              distance,
              (Math.abs(corner.dot(right)) * 1.06) / horizontalSlope +
                towardCamera,
              (Math.abs(corner.dot(up)) * 1.06) / verticalSlope + towardCamera,
            );
          }
      perspective.position
        .copy(direction.multiplyScalar(Math.min(distance, 350)))
        .add(target);
      controls.target.copy(target);
      controls.update();
    };
    const resetCamera = () => fitCamera(true);
    resetCamera();
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb9c1ac, 2.15));
    const light = new THREE.DirectionalLight(0xfff6e8, 2.4);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.left = -100;
    light.shadow.camera.right = 100;
    light.shadow.camera.top = 100;
    light.shadow.camera.bottom = -100;
    light.shadow.camera.near = 1;
    light.shadow.camera.far = 450;
    light.shadow.normalBias = 0.15;
    light.shadow.bias = -0.0002;
    light.shadow.radius = 4;
    light.target.position.set(site.width / 2, 0, site.depth / 2);
    scene.add(light, light.target);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(450, 450),
      new THREE.MeshStandardMaterial({ color: COLORS.paper, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(site.width / 2, -0.15, site.depth / 2);
    ground.receiveShadow = true;
    scene.add(ground);
    const grid = new THREE.GridHelper(300, 60, 0xe2e5dd, 0xe6e8e1);
    grid.position.set(site.width / 2, -0.1, site.depth / 2);
    scene.add(grid);
    const lawn = box(site.width, 0.22, site.depth, COLORS.grass);
    lawn.position.set(site.width / 2, 0, site.depth / 2);
    scene.add(lawn);
    const sidewalk = box(site.width + 30, 0.18, 5, 0xe4e3da);
    sidewalk.position.set(site.width / 2, 0, -3.1);
    scene.add(sidewalk);
    const road = box(site.width + 60, 0.08, 12, 0xd9ddd6);
    road.position.set(site.width / 2, -0.08, -12);
    scene.add(road);
    const path = box(4, 0.13, Math.max(1, site.house.z), 0xe9e6d9);
    path.position.set(
      site.house.x + site.house.width / 2,
      0.2,
      site.house.z / 2,
    );
    scene.add(path);
    scene.add(
      line(
        [
          new THREE.Vector3(0, 0.25, 0),
          new THREE.Vector3(site.width, 0.25, 0),
          new THREE.Vector3(site.width, 0.25, site.depth),
          new THREE.Vector3(0, 0.25, site.depth),
          new THREE.Vector3(0, 0.25, 0),
        ],
        COLORS.olive,
      ),
    );
    scene.add(
      line(
        [
          new THREE.Vector3(5, 0.26, 5),
          new THREE.Vector3(site.width - 5, 0.26, 5),
          new THREE.Vector3(site.width - 5, 0.26, site.depth - 5),
          new THREE.Vector3(5, 0.26, site.depth - 5),
          new THREE.Vector3(5, 0.26, 5),
        ],
        COLORS.olive,
        true,
      ),
    );
    scene.add(makeBuilding({ ...site.house, height: 25, roof: "gable" }, true));
    const mainName = label("EXISTING HOME", 28);
    mainName.position.set(
      site.house.x + site.house.width / 2,
      29,
      site.house.z + site.house.depth / 2,
    );
    scene.add(mainName);
    scene.add(
      tree(-5, 22, 1.05),
      tree(site.width + 6, site.depth - 12, 1.1),
      tree(-6, site.depth - 3, 0.8),
      tree(site.width + 9, 9, 0.75),
    );
    const staticDimensions = new THREE.Group();
    dimension(
      staticDimensions,
      new THREE.Vector3(0, 0.5, -7),
      new THREE.Vector3(site.width, 0.5, -7),
      `${site.width} ft lot`,
    );
    dimension(
      staticDimensions,
      new THREE.Vector3(-7, 0.5, 0),
      new THREE.Vector3(-7, 0.5, site.depth),
      `${site.depth} ft lot`,
    );
    scene.add(staticDimensions);
    const current: SceneRuntime = {
      scene,
      renderer,
      perspective,
      plan,
      camera: perspective,
      controls,
      light,
      site,
      adu: new THREE.Group(),
      annotations: new THREE.Group(),
      dragging: false,
      resetCamera,
    };
    runtime.current = current;
    addDesign(current, latest.current.project, latest.current.checks);
    updateSun(current, latest.current.hour, latest.current.month);
    const resize = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      perspective.aspect = width / height;
      perspective.updateProjectionMatrix();
      fitCamera(false);
      const extent =
        Math.max(site.depth + 28, ((site.width + 35) * height) / width) / 2;
      plan.left = (-extent * width) / height;
      plan.right = (extent * width) / height;
      plan.top = extent;
      plan.bottom = -extent;
      plan.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const point = new THREE.Vector3();
    const offset = new THREE.Vector3();
    let down: { x: number; y: number; pointerId: number } | null = null;
    let preview: DesignPatch | null = null;
    const cast = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, current.camera);
    };
    const pointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      cast(event);
      if (
        !raycaster.intersectObject(current.adu, true).length ||
        !raycaster.ray.intersectPlane(plane, point)
      )
        return;
      event.stopImmediatePropagation();
      current.dragging = true;
      controls.enabled = false;
      down = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
      offset.set(
        point.x - latest.current.project.design.x,
        0,
        -point.z - latest.current.project.design.z,
      );
      renderer.domElement.setPointerCapture(event.pointerId);
      renderer.domElement.style.cursor = "grabbing";
    };
    const pointerMove = (event: PointerEvent) => {
      cast(event);
      if (!current.dragging || !down) {
        renderer.domElement.style.cursor = raycaster.intersectObject(
          current.adu,
          true,
        ).length
          ? "grab"
          : "default";
        return;
      }
      if (!raycaster.ray.intersectPlane(plane, point)) return;
      const design = latest.current.project.design;
      const x =
        Math.round(
          Math.max(0, Math.min(site.width - design.width, point.x - offset.x)) *
            2,
        ) / 2;
      const z =
        Math.round(
          Math.max(
            0,
            Math.min(site.depth - design.depth, -point.z - offset.z),
          ) * 2,
        ) / 2;
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      preview = { x, z };
      current.adu.position.set(x, 0, z);
      current.annotations.position.set(x - design.x, 0, z - design.z);
    };
    const endDrag = (event: PointerEvent) => {
      if (!down) return;
      const didMove =
        Math.hypot(event.clientX - down.x, event.clientY - down.y) > 3;
      current.dragging = false;
      controls.enabled = latest.current.view === "3d";
      if (renderer.domElement.hasPointerCapture(down.pointerId))
        renderer.domElement.releasePointerCapture(down.pointerId);
      renderer.domElement.style.cursor = "grab";
      const patch = preview;
      const cancelled = event.type === "pointercancel";
      down = null;
      preview = null;
      if (didMove && patch && !cancelled) latest.current.onMove(patch);
      else {
        const design = latest.current.project.design;
        current.adu.position.set(design.x, 0, design.z);
        current.annotations.position.set(0, 0, 0);
      }
    };
    // Capture phase prevents OrbitControls from consuming ADU drag gestures.
    renderer.domElement.addEventListener("pointerdown", pointerDown, true);
    renderer.domElement.addEventListener("pointermove", pointerMove);
    renderer.domElement.addEventListener("pointerup", endDrag);
    renderer.domElement.addEventListener("pointercancel", endDrag);
    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      if (current.camera === perspective && !current.dragging)
        controls.update();
      if (compass.current) {
        const center = new THREE.Vector3(site.width / 2, 0, -site.depth / 2);
        const north = new THREE.Vector3(0, 0, -10)
          .applyAxisAngle(
            new THREE.Vector3(0, 1, 0),
            THREE.MathUtils.degToRad(site.north),
          )
          .add(center)
          .project(current.camera);
        center.project(current.camera);
        const angle =
          (Math.atan2(north.x - center.x, north.y - center.y) * 180) / Math.PI;
        compass.current.style.transform = `rotate(${angle}deg)`;
      }
      renderer.render(scene, current.camera);
    };
    draw();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", pointerDown, true);
      renderer.domElement.removeEventListener("pointermove", pointerMove);
      renderer.domElement.removeEventListener("pointerup", endDrag);
      renderer.domElement.removeEventListener("pointercancel", endDrag);
      controls.dispose();
      disposeGroup(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === element)
        element.removeChild(renderer.domElement);
      runtime.current = null;
    };
  }, [project.site.id]);

  useEffect(() => {
    const current = runtime.current;
    if (current) addDesign(current, project, checks);
  }, [project.design, project.revision, checks]);

  useEffect(() => {
    const current = runtime.current;
    if (!current) return;
    current.camera = view === "3d" ? current.perspective : current.plan;
    current.controls.enabled = view === "3d";
    current.controls.update();
  }, [view, project.site.id]);

  useEffect(() => {
    if (runtime.current) updateSun(runtime.current, hour, month);
  }, [hour, month, project.site.id]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 400,
        overflow: "hidden",
        background: "#f4f5f1",
      }}
    >
      <div ref={host} style={{ position: "absolute", inset: 0 }} />
      {fallback && <PlanFallback project={project} onMove={onMove} />}
      {!fallback && (
        <>
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              right: 24,
              bottom: 64,
              display: "grid",
              justifyItems: "center",
              gap: 4,
              color: "#616c59",
              pointerEvents: "none",
            }}
          >
            <span
              style={{ fontFamily: "ui-monospace,monospace", fontSize: 11 }}
            >
              N
            </span>
            <svg ref={compass} width="22" height="28" viewBox="0 0 22 28">
              <path d="M11 2 19 24 11 19 3 24Z" fill="#65715c" />
              <path d="M11 2V19L3 24Z" fill="#afb8a2" />
            </svg>
          </div>
          {view === "3d" && (
            <button
              type="button"
              aria-label="Reset camera view"
              onClick={() => runtime.current?.resetCamera()}
              style={{
                position: "absolute",
                right: 18,
                bottom: 13,
                border: "1px solid #dce1d5",
                borderRadius: 5,
                background: "rgba(255,255,255,.9)",
                color: "#54604b",
                width: 30,
                height: 30,
                cursor: "pointer",
                fontSize: 18,
                lineHeight: 1,
              }}
            >
              ↺
            </button>
          )}
        </>
      )}
    </div>
  );
}
