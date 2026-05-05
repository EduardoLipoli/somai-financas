// src/utils/format.js
export function formatarMoeda(valor) {
  if (isNaN(valor)) return "R$ 0,00";
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2
  });
}