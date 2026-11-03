import test from 'node:test';
import assert from 'node:assert/strict';
import { GroupHierarchyModel } from '../js/groupApp.js';

test('GroupHierarchyModel maintains containment relations and children lookups', () => {
  const model = new GroupHierarchyModel();
  const roots = model.getChildren(null);
  assert.equal(roots.length, 1);
  assert.equal(roots[0].name, 'CAMPUS-MAIN');

  const bldgChildren = model.getChildren(roots[0].id);
  assert.equal(bldgChildren.length, 1);
  assert.equal(bldgChildren[0].type, 'Building');

  const newRoom = model.addGroup('VOCAL-BOOTH', 'Room', bldgChildren[0].id);
  assert.ok(newRoom.id > 0);
  assert.equal(model.getChildren(bldgChildren[0].id).length, 3);
});
