import test from 'node:test';
import assert from 'node:assert/strict';
import { GroupHierarchyModel } from '../js/groupModel.js';

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

test('GroupHierarchyModel exports and imports block schemas correctly', () => {
  const model = new GroupHierarchyModel();
  const block = model.toBlock();

  assert.equal(block.type, 'group_containment');
  assert.equal(block.groups.length, 5);

  const restored = new GroupHierarchyModel();
  restored.fromBlock(block);
  assert.equal(restored.groups.length, 5);
  assert.equal(restored.groups[0].name, 'CAMPUS-MAIN');
});
