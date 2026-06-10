// ============================================================
//  test/unit/routerosPatches.test.js
//
//  Reproduce los DOS modos de crash síncrono de node-routeros v1.6.9
//  que tiraban el backend en producción (POST /api/wireguard/peers):
//
//   1. Channel.processPacket con reply '!xxx' desconocido
//      → emit('unknown') → onUnknown() throw RosException
//      → uncaughtException porque emit es síncrono desde el callback
//        del socket (fuera del contexto de cualquier Promise).
//
//   2. Receiver.sendTagData con tag no registrado
//      → throw RosException('UNREGISTEREDTAG').
//
//  El parche en server/routeros.service.js redirige ambos a `trap`
//  (caso 1) o descarta silenciosamente (caso 2) para que la promesa
//  del write rechace ordenadamente en lugar de lanzar al loop.
// ============================================================
// Carga el módulo que aplica los parches a Channel y Receiver
// (require síncrono — los parches se instalan al cargar el módulo).
require('../../routeros.service');

describe('Channel.processPacket — parche replies desconocidos', () => {
  it('!empty no lanza ni cierra el canal (cubierto por parche original)', () => {
    const { Channel } = require('node-routeros/dist/Channel');
    // Mock mínimo: Channel necesita un connector con stopRead.
    const fakeConnector = { read: () => {}, write: () => {}, stopRead: () => {} };
    const ch = new Channel(fakeConnector);
    expect(() => ch.processPacket(['!empty'])).not.toThrow();
  });

  it('!re y !done siguen funcionando normalmente (no rompemos el happy path)', () => {
    const { Channel } = require('node-routeros/dist/Channel');
    const fakeConnector = { read: () => {}, write: () => {}, stopRead: () => {} };
    const ch = new Channel(fakeConnector);
    expect(() => ch.processPacket(['!re', '=name=foo'])).not.toThrow();
    expect(() => ch.processPacket(['!done'])).not.toThrow();
  });

  it('reply desconocido NO lanza (regression del crash de wireguard/peers)', () => {
    const { Channel } = require('node-routeros/dist/Channel');
    const fakeConnector = { read: () => {}, write: () => {}, stopRead: () => {} };
    const ch = new Channel(fakeConnector);
    // Sin el parche, processPacket llamaría emit('unknown') que dispara
    // onUnknown(), que LANZA RosException — y ese throw escapa síncrono.
    expect(() => ch.processPacket(['!garbage'])).not.toThrow();
  });

  it('reply desconocido emite trap con mensaje legible (la promesa del write rechaza)', () => {
    const { Channel } = require('node-routeros/dist/Channel');
    const fakeConnector = { read: () => {}, write: () => {}, stopRead: () => {} };
    const ch = new Channel(fakeConnector);
    const trapped = [];
    ch.on('trap', (data) => trapped.push(data));
    ch.processPacket(['!whatever']);
    expect(trapped).toHaveLength(1);
    expect(trapped[0].message).toMatch(/UNKNOWNREPLY/);
    expect(trapped[0].message).toMatch(/!whatever/);
  });

  it('!trap original sigue propagándose (el parche no lo intercepta)', () => {
    const { Channel } = require('node-routeros/dist/Channel');
    const fakeConnector = { read: () => {}, write: () => {}, stopRead: () => {} };
    const ch = new Channel(fakeConnector);
    const trapped = [];
    ch.on('trap', (data) => trapped.push(data));
    ch.processPacket(['!trap', '=message=mock error']);
    expect(trapped).toHaveLength(1);
    expect(trapped[0].message).toBe('mock error');
  });
});

describe('Receiver.sendTagData — parche UNREGISTEREDTAG', () => {
  it('tag desconocido NO lanza (regression UNREGISTEREDTAG)', () => {
    const { Receiver } = require('node-routeros/dist/connector/Receiver');
    // Mock minimal del socket (Receiver lo guarda pero no lo usa para sendTagData)
    const fakeSocket = { on: () => {} };
    const rcv = new Receiver(fakeSocket);
    // No registramos ningún tag → sendTagData('inexistente') debería throw sin el parche
    rcv.currentPacket = ['!re', '=name=foo'];
    rcv.currentTag = 'inexistente';
    expect(() => rcv.sendTagData('inexistente')).not.toThrow();
    // El estado se limpia para no contaminar el siguiente packet
    expect(rcv.currentPacket).toEqual([]);
    expect(rcv.currentTag).toBeNull();
  });

  it('tag registrado sigue invocando el callback (no rompemos happy path)', () => {
    const { Receiver } = require('node-routeros/dist/connector/Receiver');
    const fakeSocket = { on: () => {} };
    const rcv = new Receiver(fakeSocket);
    const received = [];
    rcv.read('tag123', (packet) => received.push(packet));
    rcv.currentPacket = ['!re', '=k=v'];
    rcv.currentTag = 'tag123';
    rcv.sendTagData('tag123');
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(['!re', '=k=v']);
  });
});
