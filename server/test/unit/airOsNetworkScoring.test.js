const { assessAirOsNetwork } = require('@gestionvpn/contracts');

const sta = metrics => ({ role: 'sta', groupKey: 'AP-1', metrics });

describe('preselección local de receptores AirOS', () => {
  it('clasifica -61 dBm como deficiente y CCQ 12% como crítico', () => {
    const result = assessAirOsNetwork([
      sta({ signal: -61, noiseFloor: -90, ccq: 12, txRate: 20, rxRate: 20 }),
    ]);
    const row = result.rows[0];
    expect(row.level).toBe('critical');
    expect(row.score).toBeGreaterThanOrEqual(80);
    expect(row.reasons.map(reason => reason.code)).toEqual(expect.arrayContaining([
      'SIGNAL_DEFICIENT', 'CCQ_CRITICAL',
    ]));
    expect(result.selectedIndexes).toEqual([0]);
  });

  it('mantiene saludable una señal -44 con CCQ y SNR excelentes', () => {
    const result = assessAirOsNetwork([sta({ signal: -44, noiseFloor: -92, ccq: 98 })]);
    expect(result.rows[0]).toMatchObject({ score: 0, level: 'healthy', candidate: false });
    expect(result.selectedIndexes).toEqual([]);
  });

  it('excluye AP y roles desconocidos', () => {
    const result = assessAirOsNetwork([
      { role: 'ap', groupKey: null, metrics: { signal: -90, ccq: 1 } },
      { role: 'unknown', groupKey: null, metrics: { signal: -90, ccq: 1 } },
      sta({ signal: -44, noiseFloor: -92, ccq: 98 }),
    ]);
    expect(result.summary).toMatchObject({ sta: 1, apExcluded: 1, unknownExcluded: 1 });
    expect(result.rows[0].candidate).toBe(false);
    expect(result.rows[1].candidate).toBe(false);
  });

  it('selecciona como máximo los 10 STA con mayor puntaje', () => {
    const inputs = Array.from({ length: 14 }, (_, index) =>
      sta({ signal: -75 - index, noiseFloor: -90, ccq: Math.max(1, 29 - index) }));
    const result = assessAirOsNetwork(inputs);
    expect(result.summary.candidates).toBe(14);
    expect(result.selectedIndexes).toHaveLength(10);
    const selectedScores = result.selectedIndexes.map(index => result.rows[index].score);
    expect(selectedScores).toEqual([...selectedScores].sort((a, b) => b - a));
  });
});
