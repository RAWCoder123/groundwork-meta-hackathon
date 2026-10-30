import test from 'node:test';
import assert from 'node:assert/strict';
import {conceptChecks,makeOfficeConcept,validateOfficeConcept} from '../src/autonomy/concept';

test('fictional commercial concepts pass only geometric checks at suite size bounds',()=>{
 for(const [w,d] of [[10,10],[60,40],[300,300]]) {
  const c=makeOfficeConcept(w,d);assert.ok(conceptChecks(c).every(check=>check.passed));
  assert.match(c.assumptions.join(' '),/Fictional/);assert.match(c.assumptions.join(' '),/no egress/);
 }
});
test('room edges may touch but overlapping interiors are rejected',()=>{
 const c=makeOfficeConcept(); assert.doesNotThrow(()=>validateOfficeConcept(c));
 c.rooms[1].x-=.5;assert.throws(()=>validateOfficeConcept(c),/overlap/);
});
test('rooms and circulation must remain inside the suite',()=>{
 const c=makeOfficeConcept();c.rooms[0].x=59;assert.throws(()=>validateOfficeConcept(c),/fit the suite/);
 const d=makeOfficeConcept();d.circulation[0].width=61;assert.throws(()=>validateOfficeConcept(d),/Circulation/);
});
test('circulation cannot overlap room interiors or another circulation region',()=>{
 const c=makeOfficeConcept();c.circulation[0].y-=1;assert.throws(()=>validateOfficeConcept(c),/Circulation/);
 const d=makeOfficeConcept();d.circulation.push({...d.circulation[0]});assert.throws(()=>validateOfficeConcept(d),/Circulation/);
});
test('doors require an existing wall and opening span that fits it',()=>{
 const c=makeOfficeConcept();c.doors[0].roomId='invented';assert.throws(()=>validateOfficeConcept(c),/Door/);
 const d=makeOfficeConcept();d.doors[0].y-=1;assert.throws(()=>validateOfficeConcept(d),/Door/);
 const e=makeOfficeConcept();e.doors[3].x=0;assert.throws(()=>validateOfficeConcept(e),/Door/);
});
test('non-finite geometry, unsupported fields and duplicate IDs are rejected',()=>{
 assert.throws(()=>validateOfficeConcept({...makeOfficeConcept(),width:Infinity}),/Suite width/);
 assert.throws(()=>validateOfficeConcept({...makeOfficeConcept(),approved:true}),/unsupported/);
 const c=makeOfficeConcept();c.rooms[1].id=c.rooms[0].id;assert.throws(()=>validateOfficeConcept(c),/unique/);
 const d=makeOfficeConcept();d.doors[1].id=d.doors[0].id;assert.throws(()=>validateOfficeConcept(d),/unique/);
});
test('validation returns an independent bounded concept without changing its input',()=>{
 const c=makeOfficeConcept();const copy=validateOfficeConcept(c);copy.rooms[0].name='Changed';assert.notEqual(copy.rooms[0].name,c.rooms[0].name);
 assert.throws(()=>makeOfficeConcept(301,40),/Suite width/);
 assert.throws(()=>validateOfficeConcept({...c,units:'meters'}),/feet/);
});
