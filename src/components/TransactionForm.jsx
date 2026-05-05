import React, { useState, useEffect } from "react";

const mesesNome = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/**
 * TransactionForm
 *
 * Props:
 *  isOpen          boolean
 *  onClose         () => void
 *  onSave          (txData) => void
 *  categories      { [id]: name }
 *  editData        objeto com os dados da virtual row (ou null para criação)
 *  transactionType "Gasto" | "Ganho"
 *  editScope       "this_month" | "from_now" | "all" | null
 *                  Recebido de Despesas.jsx para exibir o contexto correto.
 */
export default function TransactionForm({
  isOpen,
  onClose,
  onSave,
  categories,
  editData,
  transactionType = "Ganho",
  editScope = null,
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [datepay, setDatepay] = useState("01");
  const [frequency, setFrequency] = useState("single");
  const [installments, setInstallments] = useState(2);

  // Preenche o formulário ao abrir em modo de edição
  useEffect(() => {
    if (editData) {
      setName(editData.name || "");
      setAmount(editData.amount?.toString() || "");
      setCategoryId(editData.category || "");
      setDueDate(
        editData.dueDate
          ? new Date(editData.dueDate).toISOString().split("T")[0]
          : "",
      );
      setDatepay(editData.datepay || "01");

      if (editData.isFixed) {
        setFrequency("fixed");
      } else if ((editData.installments ?? 1) > 1) {
        setFrequency("parcel");
        setInstallments(editData.installments);
      } else {
        setFrequency("single");
      }
    } else {
      resetForm();
    }
  }, [editData, isOpen]);

  const resetForm = () => {
    setName("");
    setAmount("");
    setCategoryId("");
    setDueDate("");
    setDatepay("01");
    setFrequency("single");
    setInstallments(2);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const amountNumber = parseFloat(amount.replace(",", "."));
    if (
      !name ||
      isNaN(amountNumber) ||
      amountNumber <= 0 ||
      !categoryId ||
      !dueDate
    )
      return;

    const [year, month, day] = dueDate.split("-").map(Number);
    const dateObj = new Date(year, month - 1, day);

    await onSave({
      id: editData?.id || null,
      name,
      amount: amountNumber,
      type: transactionType,
      category: categoryId,
      dueDate: dateObj,
      datepay,
      isFixed: frequency === "fixed",
      installments: frequency === "parcel" ? parseInt(installments) : 1,
      isPaid: editData?.isPaid || false,
    });

    handleClose();
  };
  // ── Contexto visual do escopo de edição ──────────────────────────────────
  const isEditing = !!editData;

  // Em edição, a frequência e o campo de parcelas são somente-leitura:
  // não faz sentido mudar uma conta fixa para parcelada pelo formulário.
  const isFrequencyLocked = isEditing;

  // Gera o rótulo do mês a partir do monthKey da editData (ex: "2025-03" → "Março 2025")
  const getMonthLabel = () => {
    if (!editData?.monthKey) return "";
    const [y, m] = editData.monthKey.split("-").map(Number);
    return `${mesesNome[m - 1]} ${y}`;
  };

  const scopeInfo = {
    this_month: {
      icon: "bi-calendar-event",
      color: "border-blue-500 bg-blue-500/10 text-blue-300",
      iconColor: "text-blue-400",
      label: `Editando apenas ${getMonthLabel()}`,
      description: "O valor base dos outros meses não será alterado.",
    },
    from_now: {
      icon: "bi-arrow-right-circle",
      color: "border-yellow-500 bg-yellow-500/10 text-yellow-300",
      iconColor: "text-yellow-400",
      label: `Novo valor a partir de ${getMonthLabel()}`,
      description: "O histórico de meses pagos anteriores será preservado.",
    },
    all: {
      icon: "bi-calendar-range",
      color: "border-green-500 bg-green-500/10 text-green-300",
      iconColor: "text-green-400",
      label: "Editando todos os meses",
      description: "O valor base será atualizado para toda a série.",
    },
  };

  const currentScopeInfo = editScope ? scopeInfo[editScope] : null;

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          onClick={handleClose}
        />
      )}

      {/* Painel lateral */}
      <div
        className={`fixed right-0 top-0 h-full w-96 bg-zinc-900 border-l border-zinc-700 shadow-2xl z-50 transition-transform duration-300 flex flex-col ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-700/60">
          <div>
            <h2 className="text-xl font-bold text-white">
              {isEditing ? "Editar" : "Adicionar"} {transactionType}
            </h2>
            {isEditing && editData?.name && (
              <p className="text-xs text-zinc-400 mt-0.5 truncate max-w-[240px]">
                {editData.name}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <i className="bi bi-x-lg text-lg"></i>
          </button>
        </div>

        {/* Conteúdo com scroll */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Banner de escopo de edição */}
          {isEditing && currentScopeInfo && (
            <div
              className={`flex items-start gap-3 p-3 rounded-xl border ${currentScopeInfo.color}`}
            >
              <i
                className={`bi ${currentScopeInfo.icon} ${currentScopeInfo.iconColor} text-lg mt-0.5 shrink-0`}
              ></i>
              <div>
                <p className="text-sm font-semibold">
                  {currentScopeInfo.label}
                </p>
                <p className="text-xs opacity-75 mt-0.5">
                  {currentScopeInfo.description}
                </p>
              </div>
            </div>
          )}

          <form
            id="transaction-form"
            onSubmit={handleSubmit}
            className="space-y-5"
          >
            {/* Tipo */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-1.5">
                Tipo
              </label>
              <div
                className={`p-2 border rounded-lg text-sm font-medium ${
                  transactionType === "Ganho"
                    ? "bg-green-900/20 border-green-800 text-green-400"
                    : "bg-red-900/20 border-red-800 text-red-400"
                }`}
              >
                {transactionType}
              </div>
            </div>

            {/* Nome */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-1.5">
                Nome
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Conta de Água"
                className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                required
              />
            </div>

            {/* Valor */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-1.5">
                Valor (R$)
              </label>
              {/* Em edição com escopo "this_month", destaca que é só para este mês */}
              {editScope === "this_month" && (
                <p className="text-xs text-blue-400 mb-1.5">
                  <i className="bi bi-info-circle mr-1"></i>
                  Novo valor exclusivo para {getMonthLabel()}
                </p>
              )}
              <input
                type="text"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                required
              />
              {/* Mostra o valor base quando editando um mês específico */}
              {isEditing &&
                editData?.baseAmount !== undefined &&
                editData.baseAmount !== parseFloat(amount) && (
                  <p className="text-xs text-zinc-500 mt-1">
                    Valor base da série: R${" "}
                    {editData.baseAmount.toFixed(2).replace(".", ",")}
                  </p>
                )}
            </div>

            {/* Categoria */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-1.5">
                Categoria
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                required
              >
                <option value="">Selecione...</option>
                {Object.entries(categories).map(([id, catName]) => (
                  <option key={id} value={id}>
                    {catName}
                  </option>
                ))}
              </select>
            </div>

            {/* Data de vencimento */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-1.5">
                {isEditing ? "Data de início da série" : "Data de vencimento"}
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                // Em edição, a data de início não muda (define o dia do mês)
                disabled={isEditing}
                className={`w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all [color-scheme:dark] ${
                  isEditing ? "opacity-50 cursor-not-allowed" : ""
                }`}
                required
              />
              {isEditing && (
                <p className="text-xs text-zinc-500 mt-1">
                  <i className="bi bi-lock text-xs mr-1"></i>A data de início
                  define o dia de cobrança e não pode ser alterada.
                </p>
              )}
            </div>

            {/* Dia de pagamento */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-1.5">
                Dia de Pagamento
              </label>
              <select
                value={datepay}
                onChange={(e) => setDatepay(e.target.value)}
                className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
              >
                <option value="01">Dia 01</option>
                <option value="15">Dia 15</option>
              </select>
            </div>

            {/* Frequência — bloqueada em edição */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Frequência
                </label>
                {isFrequencyLocked && (
                  <span className="text-xs text-zinc-500 flex items-center gap-1">
                    <i className="bi bi-lock"></i> Bloqueada em edição
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {["single", "fixed", "parcel"].map((opt) => {
                  const isSelected = frequency === opt;
                  return (
                    <label
                      key={opt}
                      className={`text-center py-2.5 px-3 text-sm font-medium rounded-lg transition-all
                        ${
                          isFrequencyLocked
                            ? isSelected
                              ? "bg-zinc-600 text-white cursor-default ring-2 ring-zinc-500"
                              : "bg-zinc-800/50 text-zinc-600 cursor-not-allowed"
                            : isSelected
                              ? "bg-green-500 text-white cursor-pointer shadow-md"
                              : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 cursor-pointer"
                        }`}
                    >
                      <input
                        type="radio"
                        className="hidden"
                        checked={isSelected}
                        disabled={isFrequencyLocked}
                        onChange={() => !isFrequencyLocked && setFrequency(opt)}
                      />
                      {opt === "single"
                        ? "Único"
                        : opt === "fixed"
                          ? "Fixo"
                          : "Parcelado"}
                    </label>
                  );
                })}
              </div>

              {isFrequencyLocked && (
                <p className="text-xs text-zinc-500 mt-1.5">
                  Para alterar a frequência, exclua e recrie a transação.
                </p>
              )}
            </div>

            {/* Qtd. de parcelas — só exibido em criação ou se já era parcelado */}
            {frequency === "parcel" && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-1.5">
                  Quantidade de Parcelas
                </label>
                <input
                  type="number"
                  min="2"
                  max="120"
                  value={installments}
                  disabled={isFrequencyLocked}
                  onChange={(e) => setInstallments(e.target.value)}
                  className={`w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all ${
                    isFrequencyLocked ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                />
                {isEditing && (
                  <p className="text-xs text-zinc-500 mt-1">
                    Parcela{" "}
                    <span className="text-zinc-300 font-medium">
                      {editData?.installmentNumber}/
                      {editData?.totalInstallments}
                    </span>{" "}
                    sendo editada.
                  </p>
                )}
              </div>
            )}
          </form>
        </div>

        {/* Rodapé fixo com botões */}
        <div className="border-t border-zinc-700/60 px-6 py-4 bg-zinc-900">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="w-full bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-2.5 rounded-xl font-medium transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="transaction-form"
              className="w-full bg-green-500 hover:bg-green-600 text-zinc-900 px-4 py-2.5 rounded-xl font-bold transition-colors shadow-md"
            >
              {isEditing ? "Salvar alteração" : "Adicionar"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
