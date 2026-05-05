import React, { useEffect, useState, useMemo } from "react";
import firebase from "firebase/compat/app";
import { auth } from "../firebase/config";
import Sidebar from "../components/Sidebar";
import TransactionForm from "../components/TransactionForm";
import { formatarMoeda } from "../utils/format";
import Loading from "../components/Loading";

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

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS — Master + Overrides
// ─────────────────────────────────────────────────────────────────────────────

function monthKeyFor(year, month) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function normalizeMaster(data, id) {
  if (data.startDate) {
    const startDate = data.startDate?.toDate
      ? data.startDate.toDate()
      : new Date(data.startDate);
    return {
      ...data,
      id,
      startDate,
      baseAmount: data.baseAmount ?? data.amount ?? 0,
      installments: data.installments ?? (data.isFixed ? 0 : 1),
      overrides: data.overrides ?? {},
    };
  }

  const dueDate = data.dueDate?.toDate
    ? data.dueDate.toDate()
    : new Date(data.dueDate ?? Date.now());

  return {
    ...data,
    id,
    startDate: dueDate,
    baseAmount: data.amount ?? 0,
    installments: data.isFixed ? 0 : (data.installments ?? 1),
    overrides: {},
    dueDate: undefined,
    amount: undefined,
  };
}

function expandMasterForMonth(master, year, month) {
  const key = monthKeyFor(year, month);
  const start =
    master.startDate instanceof Date
      ? master.startDate
      : new Date(master.startDate);

  const diffMonths =
    (year - start.getFullYear()) * 12 + (month - start.getMonth());

  if (diffMonths < 0) return null;
  if (!master.isFixed && diffMonths >= (master.installments ?? 1)) return null;

  const override = master.overrides?.[key] ?? {};

  if (override.deleted) return null;

  return {
    id: master.id,
    monthKey: key,
    name: master.name,
    type: master.type,
    category: master.category,
    datepay: master.datepay,
    isFixed: master.isFixed,
    baseAmount: master.baseAmount,
    totalInstallments: master.isFixed ? 0 : (master.installments ?? 1),
    installmentNumber: master.isFixed ? null : diffMonths + 1,
    amount: override.amount ?? master.baseAmount,
    isPaid: override.isPaid ?? false,
    dueDate: new Date(year, month, start.getDate()),
    addedOn: master.addedOn,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export default function Receitas() {
  const [user, setUser] = useState(null);

  // ── Dados ──────────────────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(true);
  const [masterTransactions, setMasterTransactions] = useState([]);
  const [categories, setCategories] = useState({});

  // ── Filtros e Navegação ────────────────────────────────────────────────────
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDatepay, setFilterDatepay] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  // ── Ordenação ──────────────────────────────────────────────────────────────
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });

  // ── UI geral ───────────────────────────────────────────────────────────────
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingVirtualRow, setEditingVirtualRow] = useState(null);

  // ── Modal de escopo de edição ──────────────────────────────────────────────
  const [showScopeModal, setShowScopeModal] = useState(false);
  const [pendingEditRow, setPendingEditRow] = useState(null);
  const [editScope, setEditScope] = useState(null);

  // ── Modal de exclusão ──────────────────────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [pendingDeleteRow, setPendingDeleteRow] = useState(null);

  // ── 1. Auth + carregamento inicial ─────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      if (currentUser) {
        setIsLoading(true);
        setUser(currentUser);
        Promise.all([
          loadCategories(currentUser.uid),
          loadTransactions(currentUser.uid),
        ]).finally(() => setIsLoading(false));
      }
    });
    return () => unsubscribe();
  }, []);

  const loadCategories = async (uid) => {
    const db = firebase.firestore();
    const snapshot = await db
      .collection("users")
      .doc(uid)
      .collection("categories")
      .where("tipo", "==", "Ganho")
      .get();
    const catsMap = {};
    snapshot.forEach((doc) => {
      catsMap[doc.id] = doc.data().name;
    });
    setCategories(catsMap);
  };

  const loadTransactions = async (uid) => {
    const db = firebase.firestore();
    const snapshot = await db
      .collection("users")
      .doc(uid)
      .collection("transactions")
      .where("type", "==", "Ganho")
      .get();
    const masters = snapshot.docs.map((doc) =>
      normalizeMaster(doc.data(), doc.id),
    );
    setMasterTransactions(masters);
  };

  // ── 2. Expansão virtual do mês atual ──────────────────────────────────────
  const expandedForMonth = useMemo(
    () =>
      masterTransactions
        .map((m) => expandMasterForMonth(m, currentYear, currentMonth))
        .filter(Boolean),
    [masterTransactions, currentYear, currentMonth],
  );

  // ── 3. Filtro e ordenação sobre o mês expandido ───────────────────────────
  const processedTransactions = useMemo(() => {
    let filtered = expandedForMonth.filter((t) => {
      const isMatchSearch = t.name
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const isMatchDatepay =
        filterDatepay === "" || t.datepay === filterDatepay;
      const isMatchCategory =
        filterCategory === "" || t.category === filterCategory;
      return isMatchSearch && isMatchDatepay && isMatchCategory;
    });

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];
        if (sortConfig.key === "category") {
          valA = categories[valA]?.toLowerCase() ?? "";
          valB = categories[valB]?.toLowerCase() ?? "";
        } else if (sortConfig.key === "name") {
          valA = valA.toLowerCase();
          valB = valB.toLowerCase();
        } else if (sortConfig.key === "dueDate") {
          valA = valA.getTime();
          valB = valB.getTime();
        }
        if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
        if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return filtered;
  }, [
    expandedForMonth,
    searchTerm,
    filterDatepay,
    filterCategory,
    sortConfig,
    categories,
  ]);

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  // ── 4. Resumos ─────────────────────────────────────────────────────────────
  const resumo = processedTransactions.reduce(
    (acc, t) => {
      if (t.datepay === "01") {
        acc.dia01 += t.amount;
        acc.qtd01++;
      }
      if (t.datepay === "15") {
        acc.dia15 += t.amount;
        acc.qtd15++;
      }
      acc.total += t.amount;
      return acc;
    },
    { dia01: 0, dia15: 0, qtd01: 0, qtd15: 0, total: 0 },
  );

  // ── 5. Ações ───────────────────────────────────────────────────────────────
  const handleSaveTransaction = async (txData, scope) => {
    const db = firebase.firestore();
    const txRef = db
      .collection("users")
      .doc(user.uid)
      .collection("transactions");

    if (!editingVirtualRow) {
      const id = Date.now().toString();
      const startDate =
        txData.dueDate instanceof Date
          ? txData.dueDate
          : new Date(txData.dueDate);

      await txRef.doc(id).set({
        id,
        name: txData.name,
        type: txData.type,
        category: txData.category,
        datepay: txData.datepay,
        isFixed: txData.isFixed ?? false,
        installments: txData.isFixed ? 0 : parseInt(txData.installments) || 1,
        baseAmount: parseFloat(txData.amount) || 0,
        startDate,
        overrides: {},
        addedOn: new Date(),
      });
    } else {
      const { id: masterId, monthKey } = editingVirtualRow;
      const master = masterTransactions.find((m) => m.id === masterId);
      const newAmount = parseFloat(txData.amount) || 0;
      const safeScope = scope || "this_month";

      if (safeScope === "this_month") {
        const existingOverride = master?.overrides?.[monthKey] ?? {};

        await txRef.doc(masterId).update({
          [`overrides.${monthKey}`]: { ...existingOverride, amount: newAmount },
          name: txData.name,
          category: txData.category,
          datepay: txData.datepay,
        });
      } else if (safeScope === "from_now") {
        const [oy, om] = monthKey.split("-").map(Number);
        const oldBaseAmount = master?.baseAmount ?? 0;
        const frozenOverrides = { ...(master?.overrides ?? {}) };

        const start =
          master?.startDate instanceof Date
            ? master.startDate
            : new Date(master?.startDate ?? Date.now());

        let iterY = start.getFullYear();
        let iterM = start.getMonth();

        while (iterY < oy || (iterY === oy && iterM < om)) {
          const k = monthKeyFor(iterY, iterM);
          const existing = frozenOverrides[k];

          if (!existing?.deleted && existing?.amount === undefined) {
            frozenOverrides[k] = { ...(existing ?? {}), amount: oldBaseAmount };
          }

          if (!master?.isFixed) {
            const diff =
              (iterY - start.getFullYear()) * 12 +
              (iterM - start.getMonth()) +
              1;
            if (diff >= (master?.installments ?? 1)) break;
          }

          iterM++;
          if (iterM > 11) {
            iterM = 0;
            iterY++;
          }
        }

        const cleanedOverrides = {};
        for (const [k, val] of Object.entries(frozenOverrides)) {
          const [ky, km] = k.split("-").map(Number);
          if (ky > oy || (ky === oy && km >= om)) {
            const { amount: _removed, ...rest } = val;
            if (Object.keys(rest).length > 0) cleanedOverrides[k] = rest;
          } else {
            cleanedOverrides[k] = val;
          }
        }

        await txRef.doc(masterId).update({
          name: txData.name,
          category: txData.category,
          datepay: txData.datepay,
          baseAmount: newAmount,
          overrides: cleanedOverrides,
        });
      } else {
        const cleanedOverrides = {};

        for (const [k, val] of Object.entries(master?.overrides ?? {})) {
          const { amount: _removed, ...rest } = val;
          if (Object.keys(rest).length > 0) cleanedOverrides[k] = rest;
        }

        await txRef.doc(masterId).update({
          name: txData.name,
          category: txData.category,
          datepay: txData.datepay,
          baseAmount: newAmount,
          overrides: cleanedOverrides,
        });
      }
    }

    setEditingVirtualRow(null);
    setEditScope(null);
    await loadTransactions(user.uid);
  };

  const togglePaid = async (tx, e) => {
    if (e.target.closest("button")) return;
    const db = firebase.firestore();
    const master = masterTransactions.find((m) => m.id === tx.id);
    const existingOverride = master?.overrides?.[tx.monthKey] ?? {};

    await db
      .collection("users")
      .doc(user.uid)
      .collection("transactions")
      .doc(tx.id)
      .update({
        [`overrides.${tx.monthKey}`]: {
          ...existingOverride,
          isPaid: !tx.isPaid,
        },
      });

    await loadTransactions(user.uid);
  };

  const deleteTransaction = (tx) => {
    setPendingDeleteRow(tx);
    setShowDeleteModal(true);
  };

  const confirmDelete = async (scope) => {
    const tx = pendingDeleteRow;
    setShowDeleteModal(false);
    setPendingDeleteRow(null);

    const db = firebase.firestore();
    const txRef = db
      .collection("users")
      .doc(user.uid)
      .collection("transactions")
      .doc(tx.id);

    if (scope === "all") {
      await txRef.delete();
    } else {
      const master = masterTransactions.find((m) => m.id === tx.id);
      const [oy, om] = tx.monthKey.split("-").map(Number);

      const start =
        master?.startDate instanceof Date
          ? master.startDate
          : new Date(master?.startDate ?? Date.now());

      const updatedOverrides = { ...(master?.overrides ?? {}) };

      let iterY = oy;
      let iterM = om - 1;

      const endY = master?.isFixed
        ? oy + 10
        : start.getFullYear() +
          Math.floor((start.getMonth() + (master?.installments ?? 1) - 1) / 12);
      const endM = master?.isFixed
        ? om - 1
        : (start.getMonth() + (master?.installments ?? 1) - 1) % 12;

      while (
        iterY < endY ||
        (iterY === endY && iterM <= endM) ||
        master?.isFixed
      ) {
        const k = monthKeyFor(iterY, iterM);
        const existing = updatedOverrides[k] ?? {};
        updatedOverrides[k] = { ...existing, deleted: true };

        iterM++;
        if (iterM > 11) {
          iterM = 0;
          iterY++;
        }

        if (!master?.isFixed) {
          const diff =
            (iterY - start.getFullYear()) * 12 + (iterM - start.getMonth());
          if (diff >= (master?.installments ?? 1)) break;
        }

        if (master?.isFixed) {
          if (iterY > oy + 10) break;
        }
      }

      await txRef.update({ overrides: updatedOverrides });
    }

    await loadTransactions(user.uid);
  };

  const handleEditClick = (tx) => {
    const isRecurring = tx.isFixed || (tx.totalInstallments ?? 1) > 1;
    if (isRecurring) {
      setPendingEditRow(tx);
      setShowScopeModal(true);
    } else {
      setEditingVirtualRow(tx);
      setEditScope("all");
      setIsFormOpen(true);
    }
  };

  const confirmScope = (scope) => {
    setEditScope(scope);
    setEditingVirtualRow(pendingEditRow);
    setPendingEditRow(null);
    setShowScopeModal(false);
    setIsFormOpen(true);
  };

  const cancelScopeModal = () => {
    setShowScopeModal(false);
    setPendingEditRow(null);
  };

  const formEditData = editingVirtualRow
    ? {
        id: editingVirtualRow.id,
        name: editingVirtualRow.name,
        amount: editingVirtualRow.amount,
        type: editingVirtualRow.type,
        category: editingVirtualRow.category,
        dueDate: editingVirtualRow.dueDate,
        datepay: editingVirtualRow.datepay,
        isFixed: editingVirtualRow.isFixed,
        installments: editingVirtualRow.totalInstallments,
        isPaid: editingVirtualRow.isPaid,
      }
    : null;

  // ── Navegação de meses ─────────────────────────────────────────────────────
  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else setCurrentMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else setCurrentMonth((m) => m + 1);
  };
  const goToCurrentMonth = () => {
    setCurrentMonth(new Date().getMonth());
    setCurrentYear(new Date().getFullYear());
  };

  // ── Sub-componentes inline ─────────────────────────────────────────────────
  const Tooltip = ({ children, text }) => (
    <div className="relative group inline-block">
      {children}
      <div
        className="absolute z-50 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200
                   bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-black text-white text-xs rounded-md
                   whitespace-nowrap pointer-events-none shadow-lg"
      >
        {text}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black"></div>
      </div>
    </div>
  );

  const SortableTH = ({ label, sortKey, tooltip }) => {
    const isActive = sortConfig.key === sortKey;
    const isAsc = sortConfig.direction === "asc";
    return (
      <th
        onClick={() => handleSort(sortKey)}
        className="group py-3 px-4 md:px-6 text-left font-semibold text-sm cursor-pointer text-white hover:text-green-400 transition-colors select-none"
      >
        <div className="inline-flex items-center gap-1">
          {label}
          <i
            className={`bi ${isActive ? (isAsc ? "bi-arrow-up" : "bi-arrow-down") : "bi-arrow-down-up"} transition-transform`}
          ></i>
        </div>
        <div
          className="absolute invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200
                     bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black text-white text-xs rounded whitespace-nowrap z-50"
        >
          {tooltip}
        </div>
      </th>
    );
  };

  const getInstallmentLabel = (tx) => {
    if (tx.isFixed) return "Fixa";
    if (tx.totalInstallments === 1) return "Avulsa";
    return `${tx.installmentNumber}/${tx.totalInstallments}x`;
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="bg-zinc-900 text-zinc-200 h-screen grid grid-cols-[auto,1fr] font-['Inter'] relative overflow-hidden">
      {isLoading && <Loading />}
      <Sidebar />

      {/* ── Modal de escopo de edição ── */}
      {showScopeModal && pendingEditRow && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-800 rounded-2xl p-6 shadow-2xl border border-zinc-700 w-full max-w-sm">
            <div className="flex items-center gap-2 mb-1">
              <i className="bi bi-pencil-square text-green-400 text-lg"></i>
              <h3 className="font-bold text-lg">Como deseja editar?</h3>
            </div>
            <p className="text-zinc-400 text-sm mb-5">
              <span className="text-white font-medium">
                "{pendingEditRow.name}"
              </span>{" "}
              é uma receita {pendingEditRow.isFixed ? "fixa" : "parcelada"}.
              Escolha o alcance da alteração:
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => confirmScope("this_month")}
                className="text-left p-4 rounded-xl bg-zinc-700/60 hover:bg-zinc-700 border border-zinc-600 hover:border-green-500 transition-all group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <i className="bi bi-calendar-event text-green-400"></i>
                  <span className="font-semibold group-hover:text-green-400 transition-colors">
                    Apenas este mês
                  </span>
                </div>
                <p className="text-xs text-zinc-400">
                  Ex: a entrada de {mesesNome[currentMonth]} teve um valor
                  diferente. Os outros meses continuam com o valor base.
                </p>
              </button>

              <button
                onClick={() => confirmScope("from_now")}
                className="text-left p-4 rounded-xl bg-zinc-700/60 hover:bg-zinc-700 border border-zinc-600 hover:border-green-500 transition-all group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <i className="bi bi-arrow-right-circle text-green-400"></i>
                  <span className="font-semibold group-hover:text-green-400 transition-colors">
                    Este mês em diante
                  </span>
                </div>
                <p className="text-xs text-zinc-400">
                  Ex: o valor recebido subiu a partir de agora. O histórico de
                  meses passados é preservado.
                </p>
              </button>

              <button
                onClick={() => confirmScope("all")}
                className="text-left p-4 rounded-xl bg-zinc-700/60 hover:bg-zinc-700 border border-zinc-600 hover:border-green-500 transition-all group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <i className="bi bi-calendar-range text-green-400"></i>
                  <span className="font-semibold group-hover:text-green-400 transition-colors">
                    Todos os meses
                  </span>
                </div>
                <p className="text-xs text-zinc-400">
                  Corrige o valor base desde o início, substituindo todos os
                  valores editados anteriormente.
                </p>
              </button>
            </div>

            <button
              onClick={cancelScopeModal}
              className="mt-4 w-full text-sm text-zinc-400 hover:text-white transition-colors py-2"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── Modal de exclusão ── */}
      {showDeleteModal && pendingDeleteRow && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-800 rounded-2xl p-6 shadow-2xl border border-zinc-700 w-full max-w-sm">
            <div className="flex items-center gap-2 mb-1">
              <i className="bi bi-trash3 text-red-400 text-lg"></i>
              <h3 className="font-bold text-lg">Excluir transação</h3>
            </div>

            {(() => {
              const isRecurring =
                pendingDeleteRow.isFixed ||
                (pendingDeleteRow.totalInstallments ?? 1) > 1;

              if (isRecurring) {
                return (
                  <>
                    <p className="text-zinc-400 text-sm mb-5">
                      <span className="text-white font-medium">
                        "{pendingDeleteRow.name}"
                      </span>{" "}
                      é uma receita{" "}
                      {pendingDeleteRow.isFixed ? "fixa" : "parcelada"}. O que
                      deseja excluir?
                    </p>
                    <div className="flex flex-col gap-3">
                      <button
                        onClick={() => confirmDelete("from_now")}
                        className="text-left p-4 rounded-xl bg-zinc-700/60 hover:bg-zinc-700 border border-zinc-600 hover:border-red-500 transition-all group"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <i className="bi bi-arrow-right-circle text-red-400"></i>
                          <span className="font-semibold group-hover:text-red-400 transition-colors">
                            Deste mês em diante
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400">
                          O histórico de meses anteriores é preservado. Apenas{" "}
                          {mesesNome[currentMonth]} e os próximos serão
                          removidos.
                        </p>
                      </button>

                      <button
                        onClick={() => confirmDelete("all")}
                        className="text-left p-4 rounded-xl bg-zinc-700/60 hover:bg-zinc-700 border border-zinc-600 hover:border-red-500 transition-all group"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <i className="bi bi-calendar-x text-red-400"></i>
                          <span className="font-semibold group-hover:text-red-400 transition-colors">
                            Excluir tudo
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400">
                          Remove completamente a transação, incluindo todo o
                          histórico de meses anteriores.
                        </p>
                      </button>
                    </div>
                  </>
                );
              } else {
                return (
                  <>
                    <p className="text-zinc-400 text-sm mb-5">
                      Tem certeza que deseja excluir a receita avulsa{" "}
                      <span className="text-white font-medium">
                        "{pendingDeleteRow.name}"
                      </span>
                      ?
                    </p>
                    <div className="flex flex-col gap-3">
                      <button
                        onClick={() => confirmDelete("all")}
                        className="p-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 hover:border-red-500 transition-all group flex items-center justify-center gap-2"
                      >
                        <i className="bi bi-trash3 text-red-400"></i>
                        <span className="font-semibold text-red-400">
                          Sim, excluir transação
                        </span>
                      </button>
                    </div>
                  </>
                );
              }
            })()}

            <button
              onClick={() => {
                setShowDeleteModal(false);
                setPendingDeleteRow(null);
              }}
              className="mt-4 w-full text-sm text-zinc-400 hover:text-white transition-colors py-2"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* ── Cabeçalho ── */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <i className="bi bi-graph-up text-green-500 text-2xl"></i>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-green-400 to-green-600 bg-clip-text text-transparent">
              Receitas
            </h1>
          </div>
          <Tooltip text="Adicionar nova receita">
            <button
              onClick={() => {
                setEditingVirtualRow(null);
                setEditScope(null);
                setIsFormOpen(true);
              }}
              className="bg-green-500 hover:bg-green-600 text-white font-bold px-5 py-2 rounded-xl shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 flex items-center gap-2"
            >
              <i className="bi bi-plus-lg"></i>
              <span className="hidden sm:inline">Adicionar</span>
            </button>
          </Tooltip>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 custom-scroll">
          {/* ── Cartões de resumo ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="bg-gradient-to-br from-zinc-800 to-zinc-800/80 p-5 rounded-2xl shadow-lg border border-white/5 hover:border-green-500/30 transition-all duration-300 group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="bi bi-calendar-day text-green-400 text-xl"></i>
                  <h3 className="font-semibold">Receitas do Dia 01</h3>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-zinc-700 text-zinc-300">
                  {resumo.qtd01} entrada(s)
                </span>
              </div>
              <p className="text-3xl font-bold mt-3 text-green-400 group-hover:text-green-300 transition-colors">
                {formatarMoeda(resumo.dia01)}
              </p>
            </div>
            <div className="bg-gradient-to-br from-zinc-800 to-zinc-800/80 p-5 rounded-2xl shadow-lg border border-white/5 hover:border-green-500/30 transition-all duration-300 group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="bi bi-calendar-week text-green-400 text-xl"></i>
                  <h3 className="font-semibold">Receitas do Dia 15</h3>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-zinc-700 text-zinc-300">
                  {resumo.qtd15} entrada(s)
                </span>
              </div>
              <p className="text-3xl font-bold mt-3 text-green-400 group-hover:text-green-300 transition-colors">
                {formatarMoeda(resumo.dia15)}
              </p>
            </div>
          </div>

          {/* ── Navegação de mês ── */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-800/80 backdrop-blur-sm p-3 rounded-xl shadow-md mb-6 border border-white/5">
            <Tooltip text="Mês anterior">
              <button
                onClick={prevMonth}
                className="p-2 rounded-lg hover:bg-zinc-700 transition-colors text-green-400"
              >
                <i className="bi bi-chevron-left text-xl"></i>
              </button>
            </Tooltip>

            <div className="relative">
              <button
                onClick={() => setShowCalendar(!showCalendar)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-700/50 hover:bg-zinc-700 transition-colors font-semibold"
              >
                <i className="bi bi-calendar3 text-green-400"></i>
                <span>
                  {mesesNome[currentMonth]} {currentYear}
                </span>
                <i
                  className={`bi bi-chevron-down transition-transform duration-200 ${showCalendar ? "rotate-180" : ""}`}
                ></i>
              </button>

              {showCalendar && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-72 bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl p-4 z-50 animate-fade-in">
                  <div className="flex justify-between items-center mb-4">
                    <button
                      onClick={() => setCurrentYear((y) => y - 1)}
                      className="p-1 px-2 rounded bg-zinc-700 hover:bg-zinc-600 transition"
                    >
                      <i className="bi bi-chevron-left"></i>
                    </button>
                    <span className="text-lg font-bold">{currentYear}</span>
                    <button
                      onClick={() => setCurrentYear((y) => y + 1)}
                      className="p-1 px-2 rounded bg-zinc-700 hover:bg-zinc-600 transition"
                    >
                      <i className="bi bi-chevron-right"></i>
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {mesesNome.map((mes, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setCurrentMonth(index);
                          setShowCalendar(false);
                        }}
                        className={`p-2 rounded-lg text-sm transition-all ${currentMonth === index ? "bg-green-600 text-white shadow-md" : "bg-zinc-700 hover:bg-zinc-600"}`}
                      >
                        {mes.substring(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Tooltip text="Voltar ao mês atual">
                <button
                  onClick={goToCurrentMonth}
                  className="p-2 rounded-lg hover:bg-zinc-700 transition-colors text-green-400"
                >
                  <i className="bi bi-calendar-check text-xl"></i>
                </button>
              </Tooltip>
              <Tooltip text="Próximo mês">
                <button
                  onClick={nextMonth}
                  className="p-2 rounded-lg hover:bg-zinc-700 transition-colors text-green-400"
                >
                  <i className="bi bi-chevron-right text-xl"></i>
                </button>
              </Tooltip>
            </div>
          </div>

          {/* ── Tabela ── */}
          <div className="bg-zinc-800/30 rounded-xl shadow-xl border border-white/5 overflow-hidden">
            <div className="bg-zinc-800/50 px-4 md:px-6 py-4 border-b border-white/10">
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <i className="bi bi-table text-green-400"></i>
                  Todas as transações
                </h2>
                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                  <div className="relative">
                    <button
                      onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
                      className="flex items-center justify-between gap-2 px-4 py-2 bg-zinc-700/70 rounded-xl border border-zinc-600 hover:bg-zinc-700 transition-all"
                    >
                      <i className="bi bi-funnel"></i>
                      <span className="text-sm font-medium">Filtros</span>
                      <i
                        className={`bi bi-chevron-down transition-transform duration-200 ${isFilterMenuOpen ? "rotate-180" : ""}`}
                      ></i>
                    </button>

                    {isFilterMenuOpen && (
                      <div className="absolute right-0 mt-2 w-64 bg-zinc-800 rounded-xl shadow-2xl border border-zinc-700 z-30 animate-fade-in">
                        <div className="p-3 space-y-3">
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-1">
                              Categoria
                            </label>
                            <select
                              value={filterCategory}
                              onChange={(e) =>
                                setFilterCategory(e.target.value)
                              }
                              className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
                            >
                              <option value="">Todas</option>
                              {Object.entries(categories).map(
                                ([id, catName]) => (
                                  <option key={id} value={id}>
                                    {catName}
                                  </option>
                                ),
                              )}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-1">
                              Dia de pagamento
                            </label>
                            <select
                              value={filterDatepay}
                              onChange={(e) => setFilterDatepay(e.target.value)}
                              className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
                            >
                              <option value="">Todos</option>
                              <option value="01">Dia 01</option>
                              <option value="15">Dia 15</option>
                            </select>
                          </div>
                          <button
                            onClick={() => {
                              setFilterCategory("");
                              setFilterDatepay("");
                              setSearchTerm("");
                            }}
                            className="w-full mt-2 text-center text-sm text-green-400 hover:text-green-300 transition-colors"
                          >
                            Limpar filtros
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="relative flex-1 lg:w-64">
                    <i className="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm"></i>
                    <input
                      type="text"
                      placeholder="Buscar..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 rounded-xl bg-zinc-700/50 border border-zinc-600 focus:ring-2 focus:ring-green-500 placeholder:text-zinc-500 text-sm transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto custom-scroll">
              <table className="min-w-[800px] w-full">
                <thead className="bg-zinc-800/80 text-xs uppercase tracking-wider">
                  <tr>
                    <SortableTH
                      label="Nome"
                      sortKey="name"
                      tooltip="Ordenar por nome"
                    />
                    <th className="py-3 px-4 text-left font-semibold text-xs">
                      Tipo
                    </th>
                    <SortableTH
                      label="Categoria"
                      sortKey="category"
                      tooltip="Ordenar por categoria"
                    />
                    <SortableTH
                      label="Vencimento"
                      sortKey="dueDate"
                      tooltip="Ordenar por data"
                    />
                    <SortableTH
                      label="Dia Pag."
                      sortKey="datepay"
                      tooltip="Ordenar por dia de pagamento"
                    />
                    <SortableTH
                      label="Valor"
                      sortKey="amount"
                      tooltip="Ordenar por valor"
                    />
                    <th className="py-3 px-4 text-left font-semibold text-xs">
                      Parcelas
                    </th>
                    <th className="py-3 px-4 text-center font-semibold text-xs">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-700/50">
                  {processedTransactions.length === 0 ? (
                    <tr>
                      <td
                        colSpan="8"
                        className="text-center py-12 text-zinc-500"
                      >
                        <i className="bi bi-inbox text-4xl block mb-2"></i>
                        Nenhuma receita encontrada para este período.
                      </td>
                    </tr>
                  ) : (
                    processedTransactions.map((tx) => (
                      <tr
                        key={`${tx.id}-${tx.monthKey}`}
                        onClick={(e) => togglePaid(tx, e)}
                        className={`cursor-pointer transition-all duration-150 hover:bg-zinc-700/30 ${tx.isPaid ? "bg-black/10 opacity-70" : ""}`}
                      >
                        <td className="py-3 px-4 font-medium">
                          <Tooltip
                            text={
                              tx.isPaid
                                ? "Desmarcar como recebido"
                                : "Marcar como recebido"
                            }
                          >
                            <span className="cursor-pointer">{tx.name}</span>
                          </Tooltip>
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full text-xs bg-green-900/30 text-green-400">
                            Ganho
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm">
                          {categories[tx.category] || "—"}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          {tx.dueDate.toLocaleDateString("pt-BR")}
                        </td>
                        <td className="py-3 px-4 text-sm">Dia {tx.datepay}</td>
                        <td className="py-3 px-4 font-medium text-green-300">
                          {formatarMoeda(tx.amount)}
                          {tx.amount !== tx.baseAmount && (
                            <Tooltip
                              text={`Valor base: ${formatarMoeda(tx.baseAmount)}`}
                            >
                              <i className="bi bi-pencil text-zinc-500 text-xs ml-1 cursor-default"></i>
                            </Tooltip>
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          {getInstallmentLabel(tx)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex justify-center gap-3">
                            <Tooltip text="Editar">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditClick(tx);
                                }}
                                className="text-zinc-400 hover:text-white transition-colors"
                              >
                                <i className="bi bi-pencil-square"></i>
                              </button>
                            </Tooltip>
                            <Tooltip text="Excluir">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteTransaction(tx);
                                }}
                                className="text-red-500 hover:text-red-400 transition-colors"
                              >
                                <i className="bi bi-trash3"></i>
                              </button>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="bg-zinc-800/80 border-t border-zinc-700 font-medium text-sm">
                  <tr>
                    <td className="py-3 px-4">Total</td>
                    <td colSpan="4"></td>
                    <td className="py-3 px-4 font-bold text-green-400">
                      {formatarMoeda(resumo.total)}
                    </td>
                    <td colSpan="2" className="py-3 px-4">
                      {processedTransactions.length} transações
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </main>
      </div>

      <TransactionForm
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingVirtualRow(null);
          setEditScope(null);
        }}
        onSave={(txData) => handleSaveTransaction(txData, editScope)}
        categories={categories}
        editData={formEditData}
        transactionType="Ganho"
        editScope={editScope}
      />
    </div>
  );
}
