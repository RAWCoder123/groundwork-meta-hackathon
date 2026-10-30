import type { OfficeConcept, OfficeDoor, OfficeRoom } from './types';

type Obj = Record<string, unknown>;
type Rect = {x:number;y:number;width:number;depth:number};
const EPS = 1e-7;
function object(value:unknown, keys:string[], name:string):Obj {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object.`);
  const obj=value as Obj;
  if (Object.keys(obj).length!==keys.length || keys.some(key=>!Object.hasOwn(obj,key))) throw new Error(`${name} has missing or unsupported fields.`);
  return obj;
}
function number(value:unknown, min:number, max:number, name:string):number {
  if (typeof value!=='number' || !Number.isFinite(value) || value<min || value>max) throw new Error(`${name} is outside the supported concept bounds.`);
  return value;
}
function text(value:unknown, max:number, name:string, empty=false):string {
  if (typeof value!=='string' || value.length>max || (!empty&&!value.trim())) throw new Error(`${name} is missing or too long.`);
  return value;
}
function list(value:unknown,max:number,name:string):unknown[] {
  if (!Array.isArray(value)||value.length>max) throw new Error(`${name} exceeds the supported concept limit.`);
  return value;
}
function rectangle(value:unknown,name:string):Rect {
  const r=object(value,['x','y','width','depth'],name);
  return {x:number(r.x,0,300,name+' x'),y:number(r.y,0,300,name+' y'),width:number(r.width,.25,300,name+' width'),depth:number(r.depth,.25,300,name+' depth')};
}
function overlaps(a:Rect,b:Rect):boolean {
  return Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>EPS && Math.min(a.y+a.depth,b.y+b.depth)-Math.max(a.y,b.y)>EPS;
}
function inside(r:Rect,w:number,d:number):boolean {
  return r.x>=0 && r.y>=0 && r.x+r.width<=w+EPS && r.y+r.depth<=d+EPS;
}
function validDoor(door:OfficeDoor,concept:OfficeConcept):boolean {
  const room=door.roomId===null?{x:0,y:0,width:concept.width,depth:concept.depth}:concept.rooms.find(r=>r.id===door.roomId);
  if (!room) return false;
  const left=room.x,right=room.x+room.width,top=room.y,bottom=room.y+room.depth,half=door.width/2;
  if (door.wall==='north'||door.wall==='south') return Math.abs(door.y-(door.wall==='north'?top:bottom))<=EPS && door.x-half>=left-EPS && door.x+half<=right+EPS;
  return Math.abs(door.x-(door.wall==='west'?left:right))<=EPS && door.y-half>=top-EPS && door.y+half<=bottom+EPS;
}

/** Geometry checks only: these do not certify egress, accessibility, fire safety or permitting. */
export function conceptChecks(concept:OfficeConcept):{title:string;passed:boolean;detail:string}[] {
  const roomBoundary=concept.rooms.every(r=>inside(r,concept.width,concept.depth));
  const circulationBoundary=concept.circulation.every(r=>inside(r,concept.width,concept.depth));
  const roomOverlap=concept.rooms.some((a,i)=>concept.rooms.slice(i+1).some(b=>overlaps(a,b)));
  const circulationOverlap=concept.circulation.some((a,i)=>concept.circulation.slice(i+1).some(b=>overlaps(a,b))) || concept.rooms.some(room=>concept.circulation.some(route=>overlaps(room,route)));
  return [
    {title:'Rooms fit the suite',passed:roomBoundary,detail:roomBoundary?'Room rectangles stay inside the declared suite boundary.':'A room extends outside the declared suite boundary.'},
    {title:'Rooms do not overlap',passed:!roomOverlap,detail:roomOverlap?'Two room rectangles overlap.':'Room rectangles share no interior area; touching edges are allowed.'},
    {title:'Circulation stays clear in the concept',passed:circulationBoundary&&!circulationOverlap,detail:circulationBoundary&&!circulationOverlap?'Circulation rectangles fit the boundary and do not overlap rooms or one another. This is not a route-compliance check.':'A circulation rectangle is outside the suite or overlaps a room or another circulation rectangle.'},
    {title:'Door locations fit their walls',passed:concept.doors.every(door=>validDoor(door,concept)),detail:'Door centres and opening spans must fit the declared suite or room wall. Swing, egress and accessibility adequacy require professional review.'},
  ];
}

export function validateOfficeConcept(value:unknown):OfficeConcept {
  const c=object(value,['units','width','depth','height','rooms','doors','circulation','existingNotes','assumptions'],'Office concept');
  if (c.units!=='ft') throw new Error('Office concept units must be feet.');
  const rooms=list(c.rooms,40,'Rooms').map(value=>{
    const r=object(value,['id','name','x','y','width','depth','kind'],'Room');
    if (typeof r.kind !== 'string' || !['office','meeting','open','support'].includes(r.kind)) throw new Error('Room kind is not supported.');
    return {id:text(r.id,80,'Room ID'),name:text(r.name,160,'Room name'),x:number(r.x,0,300,'Room x'),y:number(r.y,0,300,'Room y'),width:number(r.width,.25,300,'Room width'),depth:number(r.depth,.25,300,'Room depth'),kind:r.kind} as OfficeRoom;
  });
  const doors=list(c.doors,40,'Doors').map(value=>{
    const d=object(value,['id','x','y','width','wall','roomId'],'Door');
    if (typeof d.wall !== 'string' || !['north','south','east','west'].includes(d.wall)) throw new Error('Door wall is not supported.');
    return {id:text(d.id,80,'Door ID'),x:number(d.x,0,300,'Door x'),y:number(d.y,0,300,'Door y'),width:number(d.width,2,10,'Door width'),wall:d.wall,roomId:d.roomId===null?null:text(d.roomId,80,'Door room ID')} as OfficeDoor;
  });
  if (new Set(rooms.map(r=>r.id)).size!==rooms.length || new Set(doors.map(d=>d.id)).size!==doors.length) throw new Error('Room and door IDs must be unique within each register.');
  const concept:OfficeConcept={units:'ft',width:number(c.width,10,300,'Suite width'),depth:number(c.depth,10,300,'Suite depth'),height:number(c.height,6,30,'Suite height'),rooms,doors,circulation:list(c.circulation,20,'Circulation').map(r=>rectangle(r,'Circulation')),existingNotes:text(c.existingNotes,4000,'Existing conditions notes',true),assumptions:list(c.assumptions,20,'Assumptions').map(a=>text(a,500,'Assumption'))};
  const failed=conceptChecks(concept).find(check=>!check.passed);
  if(failed) throw new Error(failed.title+': '+failed.detail);
  return concept;
}

/** Explicitly fictional starting geometry, never an inferred property survey. */
export function makeOfficeConcept(width=60,depth=40):OfficeConcept {
  number(width,10,300,'Suite width');number(depth,10,300,'Suite depth');
  const upper=depth*.65,route=depth*.15;
  const rooms:OfficeRoom[]=[
    {id:'office-1',name:'Private office',kind:'office',x:0,y:0,width:width*.3,depth:upper},
    {id:'meeting-1',name:'Meeting room',kind:'meeting',x:width*.3,y:0,width:width*.3,depth:upper},
    {id:'open-1',name:'Open workspace',kind:'open',x:width*.6,y:0,width:width*.4,depth:upper},
    {id:'support-1',name:'Support / entry concept',kind:'support',x:0,y:upper+route,width,depth:depth-upper-route},
  ];
  const doorWidth=Math.min(3,width*.2);
  return validateOfficeConcept({units:'ft',width,depth,height:10,rooms,doors:[
    {id:'door-office',x:width*.15,y:upper,width:doorWidth,wall:'south',roomId:'office-1'},
    {id:'door-meeting',x:width*.45,y:upper,width:doorWidth,wall:'south',roomId:'meeting-1'},
    {id:'door-open',x:width*.8,y:upper,width:doorWidth,wall:'south',roomId:'open-1'},
    {id:'door-suite',x:width*.5,y:depth,width:doorWidth,wall:'south',roomId:null},
  ],circulation:[{x:0,y:upper,width,depth:route}],existingNotes:'Fictional existing suite boundary. Existing structure, services and approved conditions have not been established.',assumptions:['Fictional concept geometry for exploration; dimensions require confirmation from authorized project records.','Room rectangles describe proposed areas, not existing or approved construction.','Door locations and circulation are illustrative; no egress, accessibility, fire-safety or code compliance is certified.']});
}
