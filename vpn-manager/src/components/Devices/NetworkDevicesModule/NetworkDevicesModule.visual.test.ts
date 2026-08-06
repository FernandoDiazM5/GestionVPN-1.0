import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = path.resolve(process.cwd(), 'src/components/Devices/NetworkDevicesModule');
const moduleSource = readFileSync(path.join(sourceRoot, 'NetworkDevicesModule.tsx'), 'utf8');
const controlsSource = readFileSync(path.join(sourceRoot, 'components/ScanControls.tsx'), 'utf8');
const progressSource = readFileSync(path.join(sourceRoot, 'components/ScanProgressBanner.tsx'), 'utf8');
const globalStyles = readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');

describe('presentación de Buscar equipos', () => {
  it('ofrece un estado vacío accionable con el lenguaje de Sitios', () => {
    expect(moduleSource).toContain('Conéctate a un sitio para comenzar');
    expect(moduleSource).toContain('Ir a Sitios');
    expect(moduleSource).toContain('Ver guardados');
    expect(moduleSource).toContain('<EmptyState');
    expect(moduleSource).toContain('variant="primary" size="md"');
    expect(moduleSource).toContain('variant="outline" size="md"');
    expect(moduleSource).not.toContain('shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 sm:w-40');
    expect(globalStyles).toContain('shadow-lg shadow-indigo-500/25 hover:border-slate-300');
    expect(moduleSource).toContain("setActiveModule('nodes')");
    expect(moduleSource).toContain("setActiveModule('monitor')");
    expect(moduleSource).not.toContain('Última búsqueda');
    expect(moduleSource).not.toContain('Dispositivos de Red');
    expect(moduleSource).not.toContain('pestaña "Nodos"');
  });

  it('muestra el contexto de la conexión y usa terminología cotidiana', () => {
    expect(moduleSource).toContain('Sitio conectado');
    expect(moduleSource).toContain('Conexión activa');
    expect(moduleSource).toContain('Buscar equipos en este sitio');
    expect(controlsSource).toContain('Red donde buscar');
    expect(controlsSource).toContain("'Buscar equipos'");
    expect(progressSource).toContain('Búsqueda finalizada');
  });
});
