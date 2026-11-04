// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

export class GroupHierarchyModel {
  constructor() {
    this.name = 'STUDIO-COMPLEX-CONTAINMENT';
    this.groups = [
      { id: 1, name: 'CAMPUS-MAIN', type: 'Campus', parentId: null, color: '#3b82f6', style: 'solid', padding: 24 },
      { id: 2, name: 'BUILDING-STUDIOS', type: 'Building', parentId: 1, color: '#0ea5e9', style: 'solid', padding: 20 },
      { id: 3, name: 'CONTROL-ROOM-A', type: 'Room', parentId: 2, color: '#10b981', style: 'dashed', padding: 16 },
      { id: 4, name: 'LIVE-ROOM', type: 'Room', parentId: 2, color: '#10b981', style: 'dashed', padding: 16 },
      { id: 5, name: 'RACK-01', type: 'Rack', parentId: 3, color: '#f59e0b', style: 'solid', padding: 12 }
    ];
    this.nextId = 6;
  }

  addGroup(name, type, parentId = null, color = '#38bdf8', style = 'solid', padding = 16) {
    const g = { id: this.nextId++, name, type, parentId, color, style, padding };
    this.groups.push(g);
    return g;
  }

  removeGroup(id) {
    // Recursively delete children
    const toDelete = [id];
    let i = 0;
    while (i < toDelete.length) {
      const current = toDelete[i++];
      const children = this.groups.filter(g => g.parentId === current).map(g => g.id);
      toDelete.push(...children);
    }
    this.groups = this.groups.filter(g => !toDelete.includes(g.id));
  }

  updateGroup(id, field, value) {
    const g = this.groups.find(x => x.id === id);
    if (g) {
      g[field] = value;
    }
  }

  getChildren(parentId) {
    return this.groups.filter(g => g.parentId === parentId);
  }

  toBlock() {
    return {
      type: 'group_containment',
      id: `group_${this.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      name: this.name,
      nextId: this.nextId,
      groups: JSON.parse(JSON.stringify(this.groups))
    };
  }

  fromBlock(block = {}) {
    if (block.name) this.name = block.name;
    if (block.nextId) this.nextId = block.nextId;
    if (Array.isArray(block.groups)) {
      this.groups = JSON.parse(JSON.stringify(block.groups));
    }
  }
}
