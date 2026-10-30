"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { conceptChecks, validateOfficeConcept } from "../autonomy/concept";
import type { OfficeConcept, OfficeRoom } from "../autonomy/types";
import "../office-concept.css";

const roomColors: Record<OfficeRoom["kind"], string> = {
  office: "#d8dfcf", meeting: "#d8d6c8", open: "#e9e7dc", support: "#d5e0db",
};
function n(value: number) { return Number(value.toFixed(2)); }
type Props = { concept: OfficeConcept; onChange?: (concept: OfficeConcept) => void };

function Plan({ concept, selected, onSelect }: { concept: OfficeConcept; selected: string; onSelect: (id: string) => void }) {
  const padding = Math.max(concept.width, concept.depth) * 0.07;
  const font = Math.max(concept.width, concept.depth) * .021;
  return <svg className="office-plan" role="img" aria-label={`Commercial office concept floor plan, ${concept.width} by ${concept.depth} feet`} viewBox={`${-padding} ${-padding} ${concept.width + padding * 2} ${concept.depth + padding * 2}`}>
    <title>Proposed office concept. Geometry only; not a permit drawing.</title>
    <rect x={0} y={0} width={concept.width} height={concept.depth} fill="#f9faf5" stroke="#55614d" strokeWidth={0.25} />
    {concept.circulation.map((route, i) => <g key={i}><rect x={route.x} y={route.y} width={route.width} height={route.depth} fill="#f2eedc" stroke="#b9b59b" strokeWidth={0.1} strokeDasharray=".5 .4" /><text x={route.x + route.width / 2} y={route.y + route.depth / 2} dominantBaseline="middle" textAnchor="middle" fontSize={font * .8} fill="#8b825f">Circulation concept</text></g>)}
    {concept.rooms.map(room => <g key={room.id} role="button" tabIndex={0} aria-label={`Select ${room.name}`} onClick={() => onSelect(room.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(room.id); } }} className="office-plan-room">
      <rect x={room.x} y={room.y} width={room.width} height={room.depth} fill={roomColors[room.kind]} stroke={selected === room.id ? "#3b5730" : "#75806a"} strokeWidth={selected === room.id ? .35 : .14} />
      <text x={room.x + room.width / 2} y={room.y + room.depth / 2 - font * .5} dominantBaseline="middle" textAnchor="middle" fontSize={Math.min(font, room.width / Math.max(room.name.length * .6, 6))} fill="#3e4d35">{room.name}</text>
      <text x={room.x + room.width / 2} y={room.y + room.depth / 2 + font * .8} dominantBaseline="middle" textAnchor="middle" fontSize={font * .75} fill="#65725c">{n(room.width)} × {n(room.depth)} ft</text>
    </g>)}
    {concept.doors.map(door => {
      const horizontal = door.wall === "north" || door.wall === "south";
      return <g key={door.id}><line x1={horizontal ? door.x - door.width / 2 : door.x} y1={horizontal ? door.y : door.y - door.width / 2} x2={horizontal ? door.x + door.width / 2 : door.x} y2={horizontal ? door.y : door.y + door.width / 2} stroke="#fbfcf8" strokeWidth={.6} /><line x1={door.x} y1={door.y} x2={horizontal ? door.x : door.x + door.width} y2={horizontal ? door.y - door.width : door.y} stroke="#68745c" strokeWidth={.15} /></g>;
    })}
    <text x={concept.width / 2} y={-padding * .4} textAnchor="middle" fontSize={font} fill="#737d68">{n(concept.width)} ft</text>
    <text transform={`translate(${-padding * .4} ${concept.depth / 2}) rotate(-90)`} textAnchor="middle" fontSize={font} fill="#737d68">{n(concept.depth)} ft</text>
  </svg>;
}

function Model({ concept, reset }: { concept: OfficeConcept; reset: number }) {
  const host = useRef<HTMLDivElement>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch { setUnavailable(true); return; }
    setUnavailable(false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0xf6f7f1, 1);
    const scene = new THREE.Scene();
    const extent = Math.max(concept.width, concept.depth);
    const camera = new THREE.PerspectiveCamera(38, 1, .1, extent * 15);
    camera.position.set(concept.width * 1.1, extent * 1.05, concept.depth * 1.4);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0); controls.enableDamping = true;
    controls.minDistance = extent * .3; controls.maxDistance = extent * 5;
    controls.maxPolarAngle = Math.PI * .47;
    controls.update();
    container.append(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xa5ad98, 2.4));
    const light = new THREE.DirectionalLight(0xffffff, 2.2); light.position.set(-extent, extent * 1.6, extent); scene.add(light);
    const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [];
    function block(width: number, height: number, depth: number, x: number, y: number, z: number, color: THREE.ColorRepresentation) {
      const geometry = new THREE.BoxGeometry(width, height, depth);
      const material = new THREE.MeshStandardMaterial({color, roughness: .9});
      geometries.push(geometry); materials.push(material);
      const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); scene.add(mesh); return mesh;
    }
    const ox = concept.width / 2, oz = concept.depth / 2;
    block(concept.width + .6, .25, concept.depth + .6, 0, -.14, 0, "#c8cdbf");
    for (const room of concept.rooms) block(room.width, .05, room.depth, room.x + room.width / 2 - ox, .02, room.y + room.depth / 2 - oz, roomColors[room.kind]);
    for (const route of concept.circulation) block(route.width, .055, route.depth, route.x + route.width / 2 - ox, .025, route.y + route.depth / 2 - oz, "#e6e0c5");
    // Deduplicate shared wall segments, then cut declared door openings into each segment.
    type Segment = { horizontal: boolean; fixed: number; start: number; end: number; roomId: string | null };
    const segments: Segment[] = [];
    function walls(x: number, y: number, width: number, depth: number, roomId: string | null) {
      segments.push({horizontal: true, fixed: y, start: x, end: x + width, roomId}, {horizontal: true, fixed: y + depth, start: x, end: x + width, roomId}, {horizontal: false, fixed: x, start: y, end: y + depth, roomId}, {horizontal: false, fixed: x + width, start: y, end: y + depth, roomId});
    }
    walls(0, 0, concept.width, concept.depth, null);
    for (const room of concept.rooms) walls(room.x, room.y, room.width, room.depth, room.id);
    const seen = new Set<string>();
    for (const segment of segments) {
      const key = `${segment.horizontal}:${segment.fixed}:${segment.start}:${segment.end}`;
      if (seen.has(key)) continue; seen.add(key);
      const openings = concept.doors.filter(door => {
        const horizontal = door.wall === "north" || door.wall === "south";
        return horizontal === segment.horizontal && Math.abs((horizontal ? door.y : door.x) - segment.fixed) < .001 && (horizontal ? door.x : door.y) - door.width / 2 >= segment.start - .001 && (horizontal ? door.x : door.y) + door.width / 2 <= segment.end + .001;
      }).map(door => ({start: (segment.horizontal ? door.x : door.y) - door.width / 2, end: (segment.horizontal ? door.x : door.y) + door.width / 2})).sort((a, b) => a.start - b.start);
      let cursor = segment.start;
      const height = Math.min(concept.height, 3.6); // Cutaway wall representation; full declared height remains in the model metadata.
      function draw(start: number, end: number) {
        if (end - start < .01) return;
        if (segment.horizontal) block(end - start, height, .18, (start + end) / 2 - ox, height / 2, segment.fixed - oz, "#87937c");
        else block(.18, height, end - start, segment.fixed - ox, height / 2, (start + end) / 2 - oz, "#87937c");
      }
      for (const opening of openings) { draw(cursor, opening.start); cursor = Math.max(cursor, opening.end); }
      draw(cursor, segment.end);
    }
    const resize = () => {
      const rect = container.getBoundingClientRect();
      renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height));
      camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height); camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize); observer.observe(container); resize();
    let frame = 0;
    const animate = () => { controls.update(); renderer.render(scene, camera); frame = requestAnimationFrame(animate); }; animate();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); controls.dispose(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); };
  }, [concept, reset]);
  return <div className="office-model" ref={host} role="img" aria-label="Interactive cutaway 3D concept of the same commercial floor plan. Drag to orbit, scroll to zoom.">{unavailable && <p className="office-model-error">3D is unavailable in this browser. The linked floor plan remains available.</p>}</div>;
}

export function OfficeConceptView({ concept, onChange }: Props) {
  const [view, setView] = useState<"plan" | "3d">("plan");
  const [selected, setSelected] = useState(concept.rooms[0]?.id || "");
  const [draft, setDraft] = useState<OfficeRoom | null>(() => concept.rooms[0] ? {...concept.rooms[0]} : null);
  const [error, setError] = useState(""); const [reset, setReset] = useState(0);
  const checks = useMemo(() => conceptChecks(concept), [concept]);
  useEffect(() => {
    const room = concept.rooms.find(room => room.id === selected) || concept.rooms[0];
    setSelected(room?.id || ""); setDraft(room ? {...room} : null); setError("");
  }, [concept, selected]);
  function apply() {
    if (!draft || !onChange) return;
    try {
      const original = concept.rooms.find(room => room.id === selected);
      if (!original) throw new Error("Select a room before editing.");
      const next: OfficeConcept = {
        ...concept,
        rooms: concept.rooms.map(room => room.id === selected ? {...draft} : {...room}),
        // Keep room-associated door centres on the same wall as a room moves/resizes.
        doors: concept.doors.map(door => {
          if (door.roomId !== selected) return {...door};
          const horizontal = door.wall === "north" || door.wall === "south";
          const x = horizontal ? draft.x + (door.x - original.x) * draft.width / original.width : door.wall === "west" ? draft.x : draft.x + draft.width;
          const y = horizontal ? door.wall === "north" ? draft.y : draft.y + draft.depth : draft.y + (door.y - original.y) * draft.depth / original.depth;
          return {...door, x, y};
        }),
      };
      const valid = validateOfficeConcept(next); onChange(valid); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "That edit cannot be applied."); }
  }
  return <section className="office-concept" aria-label="Commercial concept design">
    <div className="office-concept-toolbar"><div><strong>Office concept</strong><span>{n(concept.width)} × {n(concept.depth)} ft · {n(concept.height)} ft declared height</span></div><div className="office-view-buttons"><button type="button" className={view === "plan" ? "active" : ""} onClick={() => setView("plan")}>Floor plan</button><button type="button" className={view === "3d" ? "active" : ""} onClick={() => setView("3d")}>3D concept</button>{view === "3d" && <button type="button" aria-label="Reset office camera" onClick={() => setReset(value => value + 1)}>Reset view</button>}</div></div>
    <div className="office-concept-canvas">{view === "plan" ? <Plan concept={concept} selected={selected} onSelect={setSelected} /> : <Model concept={concept} reset={reset} />}</div>
    <p className="office-concept-caption">{view === "3d" ? "Cutaway walls · Drag to orbit · Scroll to zoom. " : "Select a proposed room to inspect or edit it. "}Concept geometry only; egress, accessibility, fire safety, and technical design require professional review.</p>
    {draft && <div className="office-room-editor"><label>Selected room<select aria-label="Selected office room" value={selected} onChange={event => setSelected(event.target.value)}>{concept.rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>{onChange ? <><label>Room name<input aria-label="Office room name" value={draft.name} maxLength={160} onChange={event => setDraft({...draft, name: event.target.value})} /></label>{([['x','From west'],['y','From north'],['width','Width'],['depth','Depth']] as const).map(([field, label]) => <label key={field}>{label} (ft)<input aria-label={`Office room ${label.toLowerCase()}`} type="number" min={field === 'x' || field === 'y' ? 0 : .25} max={300} step={.25} value={Number.isFinite(draft[field]) ? draft[field] : ''} onChange={event => setDraft({...draft, [field]: event.target.value === '' ? NaN : Number(event.target.value)})} /></label>)}<button type="button" onClick={apply}>Apply concept changes</button></> : <p>{n(draft.width)} × {n(draft.depth)} ft · {n(draft.width * draft.depth)} sq ft proposed area</p>}</div>}
    {error && <p role="alert" className="office-concept-error">{error}</p>}
    <details className="office-concept-details"><summary>Geometry checks and assumptions</summary><ul>{checks.map(check => <li key={check.title}><strong>{check.passed ? "✓" : "!"} {check.title}</strong><span>{check.detail}</span></li>)}</ul><h4>Existing conditions</h4><p>{concept.existingNotes || "Existing conditions have not been established."}</p><h4>Assumptions</h4><ul>{concept.assumptions.map((assumption, i) => <li key={i}>{assumption}</li>)}</ul></details>
  </section>;
}
