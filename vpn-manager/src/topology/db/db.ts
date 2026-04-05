import Dexie, { type Table } from 'dexie';
import type { Tower, Device, Link, ApCpeGroup, ImportSession } from './tables';

export interface TopoSetting {
  key: string;
  value: string;
}

class ISPTopologyDB extends Dexie {
  towers!: Table<Tower>;
  devices!: Table<Device>;
  links!: Table<Link>;
  apCpeGroups!: Table<ApCpeGroup>;
  importSessions!: Table<ImportSession>;
  settings!: Table<TopoSetting>;

  constructor() {
    super('ISPTopologyDB');

    this.version(1).stores({
      towers: '&id, name',
      devices: '&id, towerId, type, role, name, status',
      links: '&id, sourceId, targetId, linkType, status',
      apCpeGroups: '&id, apDeviceId',
      importSessions: '&id, importedAt',
    });

    this.version(2).stores({
      towers: '&id, name, sourceNodeId, sourceType',
      devices: '&id, towerId, type, role, name, status, sourceId, sourceType',
      links: '&id, sourceId, targetId, linkType, status, sourceType',
      apCpeGroups: '&id, apDeviceId',
      importSessions: '&id, importedAt',
    }).upgrade(tx => {
      return Promise.all([
        tx.table('towers').clear(),
        tx.table('devices').clear(),
        tx.table('links').clear(),
        tx.table('apCpeGroups').clear(),
        tx.table('importSessions').clear(),
      ]);
    });

    // v3: add settings table
    this.version(3).stores({
      towers: '&id, name, sourceNodeId, sourceType',
      devices: '&id, towerId, type, role, name, status, sourceId, sourceType',
      links: '&id, sourceId, targetId, linkType, status, sourceType',
      apCpeGroups: '&id, apDeviceId',
      importSessions: '&id, importedAt',
      settings: '&key',
    });
  }
}

export const topologyDb = new ISPTopologyDB();
