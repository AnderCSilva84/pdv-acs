import { isManagementRole } from './access.js';

export function podeOperarCaixa(caixa, lojaId, usuario, role) {
  if (!caixa || caixa.uid !== lojaId || !usuario?.id) return false;
  return isManagementRole(role) || caixa.atendenteId === usuario.id;
}

export function atendentesPermitidosNoCaixa(atendentes, usuario, role) {
  return atendentes.filter(item => item.ativo !== false &&
    (isManagementRole(role) || item.id === usuario?.id));
}
