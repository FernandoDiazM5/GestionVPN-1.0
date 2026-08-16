import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const mocks=vi.hoisted(()=>({me:vi.fn(),login:vi.fn(),overview:vi.fn(),logout:vi.fn()}));
vi.mock('./api',()=>({centralApi:{...mocks,createCustomer:vi.fn(),createPlan:vi.fn(),createInstance:vi.fn()}}));
afterEach(cleanup);

describe('Joinpoint Central',()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.me.mockRejectedValue(new Error('sin sesión'));mocks.overview.mockResolvedValue([[],[],[]]);});
  it('presenta el acceso Central con la identidad visual histórica y MFA',async()=>{render(<App/>);expect(await screen.findByRole('heading',{name:'Inicia sesión'})).toBeInTheDocument();expect(screen.getByText('JOINPOINT CENTRAL')).toBeInTheDocument();expect(screen.getByLabelText('Correo')).toHaveAttribute('autocomplete','username');expect(screen.getByLabelText('Contraseña')).toHaveAttribute('autocomplete','current-password');expect(screen.getByLabelText('Código de autenticación')).toHaveAttribute('autocomplete','one-time-code');});
  it('envía los tres factores y abre el resumen',async()=>{mocks.login.mockResolvedValue({id:'1',email:'admin@joinpoint.cloud',displayName:'Administrador'});const user=userEvent.setup();render(<App/>);await user.type(await screen.findByLabelText('Correo'),'admin@joinpoint.cloud');await user.type(screen.getByLabelText('Contraseña'),'una-clave-segura');await user.type(screen.getByLabelText('Código de autenticación'),'123456');await user.click(screen.getByRole('button',{name:'Ingresar a Joinpoint'}));await waitFor(()=>expect(mocks.login).toHaveBeenCalledWith('admin@joinpoint.cloud','una-clave-segura','123456'));expect(await screen.findByText('Estado de la plataforma')).toBeInTheDocument();});
});
