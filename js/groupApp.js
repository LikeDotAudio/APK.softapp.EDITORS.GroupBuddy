// Part of the APK.audio project — Anthony Kuzub
// MIT Licence.

export class GroupHierarchyModel {
  constructor() {
    this.groups = [
      { id: 1, name: 'CAMPUS-MAIN', type: 'Campus', parentId: null, color: '#3b82f6' },
      { id: 2, name: 'BUILDING-STUDIOS', type: 'Building', parentId: 1, color: '#0ea5e9' },
      { id: 3, name: 'CONTROL-ROOM-A', type: 'Room', parentId: 2, color: '#10b981' },
      { id: 4, name: 'LIVE-ROOM', type: 'Room', parentId: 2, color: '#10b981' },
      { id: 5, name: 'RACK-01', type: 'Rack', parentId: 3, color: '#f59e0b' }
    ];
    this.nextId = 6;
  }

  addGroup(name, type, parentId, color = '#38bdf8') {
    const g = { id: this.nextId++, name, type, parentId, color };
    this.groups.push(g);
    return g;
  }

  getChildren(parentId) {
    return this.groups.filter(g => g.parentId === parentId);
  }
}
