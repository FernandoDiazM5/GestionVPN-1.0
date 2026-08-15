import { describe, it, expect } from 'vitest';
const { main } = require('../../db/preseedGreenfield');

function transaction(settings = [], nodes = []) {
  const writes=[];
  return { writes, run:async fn=>fn({query:async(sql,params=[])=>{
    if (sql.startsWith('SELECT `key`')) return settings;
    if (sql.startsWith('SELECT id FROM nodes')) return nodes;
    writes.push({sql,params}); return {};
  }}) };
}

describe('preseed greenfield del /22',()=>{
  it('siembra recomendacion solo cuando la base esta vacia',async()=>{
    const tx=transaction();
    const result=await main({cidr:'10.64.0.0/22',transaction:tx.run});
    expect(result.plan.net).toBe('10.64.0.0/22');
    expect(tx.writes.map(item=>item.params[0])).toEqual(['management_supernet','management_supernet_source']);
  });

  it('preserva una eleccion posterior del administrador',async()=>{
    const tx=transaction([{key:'management_supernet',value:'10.80.0.0/22'}]);
    const result=await main({cidr:'10.64.0.0/22',transaction:tx.run});
    expect(result.preserved).toBe(true);
    expect(result.plan.net).toBe('10.80.0.0/22');
    expect(tx.writes).toHaveLength(0);
  });

  it('falla cerrado si existen sitios sin configuracion inicial',async()=>{
    const tx=transaction([], [{id:'site-1'}]);
    await expect(main({cidr:'10.64.0.0/22',transaction:tx.run})).rejects.toMatchObject({code:'GREENFIELD_NETWORK_ALREADY_LOCKED'});
  });
});
