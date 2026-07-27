import {
  calculateKebabCoords,
  shouldCloseKebabOnScroll,
} from './useKebabMenu';

describe('calculateKebabCoords', () => {
  it('abre debajo cuando existe espacio suficiente', () => {
    expect(calculateKebabCoords(
      { top: 100, bottom: 144, right: 1100 },
      { width: 1200, height: 900 },
    )).toEqual({
      top: 148,
      right: 100,
      maxHeight: 744,
    });
  });

  it('abre arriba cuando el nodo está cerca del borde inferior', () => {
    expect(calculateKebabCoords(
      { top: 700, bottom: 744, right: 1100 },
      { width: 1200, height: 900 },
    )).toEqual({
      bottom: 204,
      right: 100,
      maxHeight: 688,
    });
  });

  it('limita la altura al espacio visible cuando ningún lado alcanza', () => {
    const coords = calculateKebabCoords(
      { top: 360, bottom: 404, right: 790 },
      { width: 800, height: 720 },
    );

    expect(coords).toEqual({
      bottom: 364,
      right: 10,
      maxHeight: 348,
    });
    expect((coords.bottom ?? 0) + coords.maxHeight).toBeLessThanOrEqual(712);
  });

  it('mantiene el menú dentro de los márgenes horizontales', () => {
    expect(calculateKebabCoords(
      { top: 100, bottom: 144, right: 80 },
      { width: 320, height: 640 },
    ).right).toBe(104);
  });
});

describe('shouldCloseKebabOnScroll', () => {
  it('mantiene abierto el menú durante su scroll interno', () => {
    const menu = document.createElement('div');
    const item = document.createElement('button');
    menu.appendChild(item);

    expect(shouldCloseKebabOnScroll(menu, menu)).toBe(false);
    expect(shouldCloseKebabOnScroll(item, menu)).toBe(false);
  });

  it('cierra el menú cuando se desplaza un contenedor externo', () => {
    const menu = document.createElement('div');
    const page = document.createElement('main');

    expect(shouldCloseKebabOnScroll(page, menu)).toBe(true);
    expect(shouldCloseKebabOnScroll(window, menu)).toBe(true);
  });
});
