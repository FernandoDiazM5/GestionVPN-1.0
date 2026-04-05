import { v4 as uuidv4 } from 'uuid';
import { topologyDb } from './db';

export async function seedDemoData(): Promise<void> {
  const count = await topologyDb.towers.count();
  if (count > 0) return;

  const now = Date.now();

  // IDs
  const towerId = uuidv4();
  const switchId = uuidv4();
  const mainPtpId = uuidv4();
  const apId = uuidv4();
  const stationPtpId = uuidv4();
  const cpe1Id = uuidv4();
  const cpe2Id = uuidv4();

  // Tower
  await topologyDb.towers.add({
    id: towerId,
    name: 'Tower 1',
    location: 'Main Site',
    sourceType: 'manual' as const,
    canvasX: 80,
    canvasY: 80,
    canvasWidth: 500,
    canvasHeight: 380,
    collapsed: false,
    createdAt: now,
    updatedAt: now,
  });

  // Devices inside tower
  await topologyDb.devices.bulkAdd([
    {
      id: switchId,
      towerId,
      type: 'router',
      role: 'tower_router',
      name: 'Switch1',
      model: 'UISP Switch',
      brand: 'Ubiquiti',
      ipAddress: '192.168.1.1',
      canvasX: 60,
      canvasY: 160,
      status: 'online',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: mainPtpId,
      towerId,
      type: 'ptp',
      role: 'ptp_main',
      name: 'Main1',
      model: 'airFiber 60 LR',
      brand: 'Ubiquiti',
      ipAddress: '192.168.1.2',
      canvasX: 340,
      canvasY: 70,
      status: 'online',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: apId,
      towerId,
      type: 'ap',
      role: 'ap',
      name: 'AP1',
      model: 'LTU-Rocket',
      brand: 'Ubiquiti',
      ipAddress: '192.168.1.3',
      canvasX: 340,
      canvasY: 260,
      status: 'online',
      createdAt: now,
      updatedAt: now,
    },
  ]);

  // Devices outside tower
  await topologyDb.devices.bulkAdd([
    {
      id: stationPtpId,
      towerId: null,
      type: 'ptp',
      role: 'ptp_station',
      name: 'Station1',
      model: 'airFiber 60 LR',
      brand: 'Ubiquiti',
      ipAddress: '192.168.2.1',
      canvasX: 820,
      canvasY: 130,
      status: 'online',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: cpe1Id,
      towerId: null,
      type: 'cpe',
      role: 'cpe',
      name: 'Station1_CPE',
      model: 'LTU-LR',
      brand: 'Ubiquiti',
      ipAddress: '192.168.3.1',
      canvasX: 820,
      canvasY: 320,
      status: 'offline',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: cpe2Id,
      towerId: null,
      type: 'cpe',
      role: 'cpe',
      name: 'Station2_CPE',
      model: 'LTU-LR',
      brand: 'Ubiquiti',
      ipAddress: '192.168.3.2',
      canvasX: 820,
      canvasY: 460,
      status: 'offline',
      createdAt: now,
      updatedAt: now,
    },
  ]);

  // Links
  await topologyDb.links.bulkAdd([
    {
      id: uuidv4(),
      name: 'Switch-Main PTP',
      sourceId: switchId,
      targetId: mainPtpId,
      linkType: 'wired',
      status: 'active',
      capacityGbps: 1.0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      name: 'Switch-AP',
      sourceId: switchId,
      targetId: apId,
      linkType: 'wired',
      status: 'active',
      capacityGbps: 1.0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      name: 'PTP Link',
      sourceId: mainPtpId,
      targetId: stationPtpId,
      linkType: 'wireless_ptp',
      status: 'active',
      capacityGbps: 1.95,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      name: 'AP-CPE1',
      sourceId: apId,
      targetId: cpe1Id,
      linkType: 'wireless_ptmp',
      status: 'no_link',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      name: 'AP-CPE2',
      sourceId: apId,
      targetId: cpe2Id,
      linkType: 'wireless_ptmp',
      status: 'no_link',
      createdAt: now,
      updatedAt: now,
    },
  ]);

  // AP-CPE Group
  await topologyDb.apCpeGroups.add({
    id: uuidv4(),
    apDeviceId: apId,
    cpeDeviceIds: [cpe1Id, cpe2Id],
    expanded: true,
    updatedAt: now,
  });

  // Import session record
  await topologyDb.importSessions.add({
    id: uuidv4(),
    importedAt: now,
    source: 'manual',
    rawPayload: '{}',
    devicesImported: 6,
    towerId,
    notes: 'Demo seed data',
  });
}
