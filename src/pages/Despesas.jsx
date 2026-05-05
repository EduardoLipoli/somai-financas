import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
} from "react";
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
// HELPERS — Datas (fuso horário seguro)
// ─────────────────────────────────────────────────────────────────────────────

/** Retorna hoje às 00:00:00 no horário LOCAL (evita bug de fuso UTC). */
function todayLocal() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Gera a chave "YYYY-MM" para um dado ano/mês (month = 0-based). */
function monthKeyFor(year, month) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS — Master + Overrides
// ─────────────────────────────────────────────────────────────────────────────

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
    note: override.note ?? "",
    dueDate: new Date(year, month, start.getDate()),
    addedOn: master.addedOn,
    history: master.history ?? [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: Toast de notificação
// ─────────────────────────────────────────────────────────────────────────────

function Toast({ toasts }) {
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium border backdrop-blur-sm pointer-events-auto
            ${
              t.type === "success"
                ? "bg-green-900/90 border-green-600 text-green-200"
                : t.type === "error"
                  ? "bg-red-900/90 border-red-600 text-red-200"
                  : "bg-zinc-800/90 border-zinc-600 text-zinc-200"
            }`}
        >
          <i
            className={`bi ${
              t.type === "success"
                ? "bi-check-circle-fill text-green-400"
                : t.type === "error"
                  ? "bi-x-circle-fill text-red-400"
                  : "bi-info-circle-fill text-zinc-400"
            } text-base`}
          ></i>
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: Gráfico de barras (evolução mensal por categoria)
// ─────────────────────────────────────────────────────────────────────────────

function GraficoEvolucao({
  masterTransactions,
  categories,
  currentYear,
  currentMonth,
}) {
  const meses = useMemo(() => {
    const result = [];
    let y = currentYear,
      m = currentMonth;
    for (let i = 0; i < 6; i++) {
      result.unshift({ year: y, month: m, key: monthKeyFor(y, m) });
      m--;
      if (m < 0) {
        m = 11;
        y--;
      }
    }
    return result;
  }, [currentYear, currentMonth]);

  const dadosPorMes = useMemo(
    () =>
      meses.map(({ year, month, key }) => {
        const expanded = masterTransactions
          .map((m) => expandMasterForMonth(m, year, month))
          .filter(Boolean);
        const total = expanded.reduce((s, t) => s + t.amount, 0);
        const porCat = {};
        expanded.forEach((t) => {
          porCat[t.category] = (porCat[t.category] ?? 0) + t.amount;
        });
        return { key, year, month, total, porCat };
      }),
    [meses, masterTransactions],
  );

  const maxTotal = Math.max(...dadosPorMes.map((d) => d.total), 1);

  const topCats = useMemo(() => {
    const totais = {};
    dadosPorMes.forEach((d) => {
      Object.entries(d.porCat).forEach(([k, v]) => {
        totais[k] = (totais[k] ?? 0) + v;
      });
    });
    return Object.entries(totais)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([id]) => id);
  }, [dadosPorMes]);

  const catColors = [
    "bg-green-500",
    "bg-blue-500",
    "bg-yellow-500",
    "bg-purple-500",
  ];

  return (
    <div className="bg-zinc-800/50 rounded-2xl border border-white/5 p-5 mb-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="font-semibold flex items-center gap-2">
          <i className="bi bi-bar-chart-line text-green-400"></i>
          Evolução dos últimos 6 meses
        </h3>
        <div className="flex flex-wrap gap-3">
          {topCats.map((catId, i) => (
            <div
              key={catId}
              className="flex items-center gap-1 text-xs text-zinc-400"
            >
              <span className={`w-2 h-2 rounded-full ${catColors[i]}`}></span>
              {categories[catId] ?? "—"}
            </div>
          ))}
          {topCats.length <
            Object.keys(
              dadosPorMes.reduce((acc, d) => ({ ...acc, ...d.porCat }), {}),
            ).length && (
            <div className="flex items-center gap-1 text-xs text-zinc-400">
              <span className="w-2 h-2 rounded-full bg-zinc-500"></span>
              Outros
            </div>
          )}
        </div>
      </div>
      <div className="flex items-end gap-2 h-40">
        {dadosPorMes.map(({ key, month, total, porCat }) => {
          const heightPct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
          return (
            <div
              key={key}
              className="flex-1 h-full flex flex-col items-center justify-end gap-1 group relative" // Adicionado h-full e justify-end
            >
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl">
                <p className="font-bold text-white mb-1">
                  {mesesNome[month].substring(0, 3)}: {formatarMoeda(total)}
                </p>
                {topCats.map((catId) =>
                  porCat[catId] ? (
                    <p key={catId} className="text-zinc-400">
                      {categories[catId]}: {formatarMoeda(porCat[catId])}
                    </p>
                  ) : null,
                )}
              </div>
              <div
                className="w-full rounded-t-md overflow-hidden flex flex-col-reverse transition-all duration-500"
                style={{
                  height: `${heightPct}%`,
                  minHeight: total > 0 ? "4px" : "0",
                }}
              >
                {topCats.map((catId, i) => {
                  const val = porCat[catId] ?? 0;
                  const pct = total > 0 ? (val / total) * 100 : 0;
                  return pct > 0 ? (
                    <div
                      key={catId}
                      className={`${catColors[i]} w-full`}
                      style={{ height: `${pct}%` }}
                    ></div>
                  ) : null;
                })}
                {(() => {
                  const topTotal = topCats.reduce(
                    (s, id) => s + (porCat[id] ?? 0),
                    0,
                  );
                  const outros = total - topTotal;
                  return outros > 0 ? (
                    <div
                      className="bg-zinc-500 w-full"
                      style={{ height: `${(outros / total) * 100}%` }}
                    ></div>
                  ) : null;
                })()}
              </div>
              <span className="text-xs text-zinc-500">
                {mesesNome[month].substring(0, 3)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: Modal de nota por mês
// ─────────────────────────────────────────────────────────────────────────────

function NoteModal({ tx, onSave, onClose }) {
  const [note, setNote] = useState(tx?.note ?? "");
  const getMonthLabel = () => {
    if (!tx?.monthKey) return "";
    const [y, m] = tx.monthKey.split("-").map(Number);
    return `${mesesNome[m - 1]} ${y}`;
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-800 rounded-2xl p-6 shadow-2xl border border-zinc-700 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-1">
          <i className="bi bi-sticky text-yellow-400 text-lg"></i>
          <h3 className="font-bold text-lg">Observação do mês</h3>
        </div>
        <p className="text-zinc-400 text-sm mb-4">
          <span className="text-white font-medium">"{tx?.name}"</span> —{" "}
          {getMonthLabel()}
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ex: conta veio mais cara por causa do verão..."
          rows={3}
          className="w-full px-3 py-2.5 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder:text-zinc-500 focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition-all resize-none"
          maxLength={300}
        />
        <p className="text-xs text-zinc-500 text-right mt-1">
          {note.length}/300
        </p>
        <div className="flex gap-3 mt-4">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-xl text-sm font-medium transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSave(note)}
            className="flex-1 py-2 bg-yellow-500 hover:bg-yellow-400 text-zinc-900 rounded-xl text-sm font-bold transition-colors"
          >
            Salvar nota
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: Modal de histórico de alterações
// ─────────────────────────────────────────────────────────────────────────────

function HistoryModal({ tx, onClose }) {
  const history = tx?.history ?? [];
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-800 rounded-2xl p-6 shadow-2xl border border-zinc-700 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <i className="bi bi-clock-history text-blue-400 text-lg"></i>
            <h3 className="font-bold text-lg">Histórico de alterações</h3>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
        <p className="text-zinc-400 text-sm mb-4">
          <span className="text-white font-medium">"{tx?.name}"</span>
        </p>
        {history.length === 0 ? (
          <p className="text-zinc-500 text-sm text-center py-6">
            Nenhuma alteração registrada ainda.
          </p>
        ) : (
          <div className="space-y-3 max-h-72 overflow-y-auto custom-scroll">
            {[...history].reverse().map((h, i) => (
              <div key={i} className="flex gap-3 p-3 bg-zinc-700/50 rounded-xl">
                <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <i className="bi bi-pencil text-blue-400 text-xs"></i>
                </div>
                <div>
                  <p className="text-sm text-white">{h.description}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {h.at
                      ? new Date(
                          h.at?.seconds ? h.at.seconds * 1000 : h.at,
                        ).toLocaleString("pt-BR")
                      : "—"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={onClose}
          className="mt-4 w-full py-2 bg-zinc-700 hover:bg-zinc-600 rounded-xl text-sm font-medium transition-colors"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 15;

export default function Despesas() {
  const [user, setUser] = useState(null);

  // ── Dados ──────────────────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(true);
  const [masterTransactions, setMasterTransactions] = useState([]);
  const [categories, setCategories] = useState({});
  const [overdueTransactions, setOverdueTransactions] = useState([]);

  // ── Filtros e Navegação ────────────────────────────────────────────────────
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDatepay, setFilterDatepay] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  // ── Ordenação e Paginação ──────────────────────────────────────────────────
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  const [page, setPage] = useState(1);

  // ── UI geral ───────────────────────────────────────────────────────────────
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingVirtualRow, setEditingVirtualRow] = useState(null);
  const [showOverduePopup, setShowOverduePopup] = useState(false);
  const [dontShowAgainToday, setDontShowAgainToday] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showGrafico, setShowGrafico] = useState(true);

  // ── Toast ──────────────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState([]);
  const toastId = useRef(0);

  const addToast = useCallback((message, type = "success") => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      3500,
    );
  }, []);

  // ── Modais ─────────────────────────────────────────────────────────────────
  const [showScopeModal, setShowScopeModal] = useState(false);
  const [pendingEditRow, setPendingEditRow] = useState(null);
  const [editScope, setEditScope] = useState(null);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [pendingDeleteRow, setPendingDeleteRow] = useState(null);

  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteTargetTx, setNoteTargetTx] = useState(null);

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyTargetTx, setHistoryTargetTx] = useState(null);

  // ── Alertas de vencimento próximo ─────────────────────────────────────────
  const [upcomingTransactions, setUpcomingTransactions] = useState([]);
  const [showUpcomingPopup, setShowUpcomingPopup] = useState(false);

  // ── 1. Auth + carregamento ─────────────────────────────────────────────────
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
      .where("tipo", "==", "Gasto")
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
      .where("type", "==", "Gasto")
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

  // ── 3. Dívidas atrasadas (fuso correto) ───────────────────────────────────
  useEffect(() => {
    const todayStr = new Date().toDateString();
    const storedDontShow = localStorage.getItem("dontShowOverdueToday");
    if (storedDontShow === todayStr) {
      setDontShowAgainToday(true);
      setShowOverduePopup(false);
      return;
    }

    const today = todayLocal();
    const overdue = [];

    for (const master of masterTransactions) {
      const start =
        master.startDate instanceof Date
          ? master.startDate
          : new Date(master.startDate);
      let y = start.getFullYear(),
        m = start.getMonth();
      const limitY = today.getFullYear(),
        limitM = today.getMonth();

      while (y < limitY || (y === limitY && m <= limitM)) {
        const virtual = expandMasterForMonth(master, y, m);
        if (virtual && !virtual.isPaid) {
          const dueLocal = new Date(
            virtual.dueDate.getFullYear(),
            virtual.dueDate.getMonth(),
            virtual.dueDate.getDate(),
          );
          if (dueLocal < today) overdue.push(virtual);
        }
        m++;
        if (m > 11) {
          m = 0;
          y++;
        }
        if (!master.isFixed) {
          const diff = (y - start.getFullYear()) * 12 + (m - start.getMonth());
          if (diff >= (master.installments ?? 1)) break;
        }
      }
    }

    setOverdueTransactions(overdue);
    if (overdue.length > 0 && !dontShowAgainToday) setShowOverduePopup(true);
  }, [masterTransactions, dontShowAgainToday]);

  // ── 4. Alertas de vencimento próximo (próximos 5 dias) ────────────────────
  useEffect(() => {
    const today = todayLocal();
    const soon = new Date(today);
    soon.setDate(soon.getDate() + 5);

    const upcoming = expandedForMonth.filter((tx) => {
      if (tx.isPaid) return false;
      const dueLocal = new Date(
        tx.dueDate.getFullYear(),
        tx.dueDate.getMonth(),
        tx.dueDate.getDate(),
      );
      return dueLocal >= today && dueLocal <= soon;
    });

    setUpcomingTransactions(upcoming);
    if (upcoming.length > 0) setShowUpcomingPopup(true);
  }, [expandedForMonth]);

  // ── 5. Filtro, ordenação e paginação ──────────────────────────────────────
  const filteredTransactions = useMemo(() => {
    let filtered = expandedForMonth.filter((t) => {
      const isMatchSearch = t.name
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const isMatchDatepay =
        filterDatepay === "" || t.datepay === filterDatepay;
      const isMatchCategory =
        filterCategory === "" || t.category === filterCategory;
      let isMatchStatus = true;
      if (filterStatus === "paid") isMatchStatus = t.isPaid;
      if (filterStatus === "unpaid") isMatchStatus = !t.isPaid;
      return (
        isMatchSearch && isMatchDatepay && isMatchStatus && isMatchCategory
      );
    });

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let valA = a[sortConfig.key],
          valB = b[sortConfig.key];
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
    filterStatus,
    filterCategory,
    sortConfig,
    categories,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredTransactions.length / PAGE_SIZE),
  );
  const processedTransactions = useMemo(
    () => filteredTransactions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredTransactions, page],
  );

  useEffect(() => {
    setPage(1);
  }, [
    searchTerm,
    filterDatepay,
    filterStatus,
    filterCategory,
    currentMonth,
    currentYear,
  ]);

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  // ── 6. Resumos ─────────────────────────────────────────────────────────────
  const resumoCartoes = useMemo(
    () =>
      expandedForMonth.reduce(
        (acc, t) => {
          if (!t.isPaid) {
            if (t.datepay === "01") {
              acc.dia01 += t.amount;
              acc.qtd01++;
            }
            if (t.datepay === "15") {
              acc.dia15 += t.amount;
              acc.qtd15++;
            }
          }
          return acc;
        },
        { dia01: 0, dia15: 0, qtd01: 0, qtd15: 0 },
      ),
    [expandedForMonth],
  );

  const totalTabela = useMemo(
    () => filteredTransactions.reduce((sum, t) => sum + t.amount, 0),
    [filteredTransactions],
  );

  // ── 7. Ações ───────────────────────────────────────────────────────────────

  function buildHistoryEntry(description) {
    return { description, at: new Date() };
  }

  const handleSaveTransaction = async (txData, scope) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const db = firebase.firestore();
      const txRef = db
        .collection("users")
        .doc(user.uid)
        .collection("transactions");

      if (!editingVirtualRow) {
        // ── CRIAÇÃO ────────────────────────────────────────────────────────
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
          history: [buildHistoryEntry("Transação criada")],
          addedOn: new Date(),
        });
        addToast("Despesa adicionada com sucesso!", "success");
      } else {
        // ── EDIÇÃO ──────────────────────────────────────────────────────────
        const { id: masterId, monthKey } = editingVirtualRow;
        const master = masterTransactions.find((m) => m.id === masterId);
        const newAmount = parseFloat(txData.amount) || 0;
        const safeScope = scope || "this_month";

        const historyEntry = buildHistoryEntry(
          safeScope === "this_month"
            ? `Valor alterado para ${formatarMoeda(newAmount)} apenas em ${monthKey}`
            : safeScope === "from_now"
              ? `Novo valor base ${formatarMoeda(newAmount)} a partir de ${monthKey}`
              : `Valor base alterado para ${formatarMoeda(newAmount)} em todos os meses`,
        );

        if (safeScope === "this_month") {
          const existingOverride = master?.overrides?.[monthKey] ?? {};
          await txRef.doc(masterId).update({
            [`overrides.${monthKey}`]: {
              ...existingOverride,
              amount: newAmount,
            },
            name: txData.name,
            category: txData.category,
            datepay: txData.datepay,
            history: firebase.firestore.FieldValue.arrayUnion(historyEntry),
          });
        } else if (safeScope === "from_now") {
          const [oy, om] = monthKey.split("-").map(Number);
          const oldBaseAmount = master?.baseAmount ?? 0;
          const existingOverrides = master?.overrides ?? {};
          const start =
            master?.startDate instanceof Date
              ? master.startDate
              : new Date(master?.startDate ?? Date.now());
          const frozenOverrides = { ...existingOverrides };

          let iterY = start.getFullYear(),
            iterM = start.getMonth();
          while (iterY < oy || (iterY === oy && iterM < om)) {
            const k = monthKeyFor(iterY, iterM);
            const existing = frozenOverrides[k];
            if (!existing?.deleted && existing?.amount === undefined) {
              frozenOverrides[k] = {
                ...(existing ?? {}),
                amount: oldBaseAmount,
              };
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
            history: firebase.firestore.FieldValue.arrayUnion(historyEntry),
          });
        } else {
          // "all"
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
            history: firebase.firestore.FieldValue.arrayUnion(historyEntry),
          });
        }
        addToast("Alteração salva com sucesso!", "success");
      }

      setEditingVirtualRow(null);
      setEditScope(null);
      await loadTransactions(user.uid);
    } catch (err) {
      console.error(err);
      addToast("Erro ao salvar. Tente novamente.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const togglePaid = async (tx, e) => {
    if (e.target.closest("button")) return;
    const db = firebase.firestore();
    const master = masterTransactions.find((m) => m.id === tx.id);
    const existingOverride = master?.overrides?.[tx.monthKey] ?? {};
    const newIsPaid = !tx.isPaid;
    try {
      await db
        .collection("users")
        .doc(user.uid)
        .collection("transactions")
        .doc(tx.id)
        .update({
          [`overrides.${tx.monthKey}`]: {
            ...existingOverride,
            isPaid: newIsPaid,
          },
        });
      addToast(
        newIsPaid ? "Marcado como pago ✓" : "Desmarcado como pago",
        "success",
      );
      await loadTransactions(user.uid);
    } catch {
      addToast("Erro ao atualizar status.", "error");
    }
  };

  const deleteOnlyThisMonth = async (tx) => {
    const db = firebase.firestore();
    const master = masterTransactions.find((m) => m.id === tx.id);
    const existingOverride = master?.overrides?.[tx.monthKey] ?? {};
    try {
      await db
        .collection("users")
        .doc(user.uid)
        .collection("transactions")
        .doc(tx.id)
        .update({
          [`overrides.${tx.monthKey}`]: { ...existingOverride, deleted: true },
          history: firebase.firestore.FieldValue.arrayUnion(
            buildHistoryEntry(`Removido apenas em ${tx.monthKey}`),
          ),
        });
      addToast("Mês removido com sucesso.", "success");
      await loadTransactions(user.uid);
    } catch {
      addToast("Erro ao remover mês.", "error");
    }
  };

  const deleteTransaction = (tx) => {
    const isRecurring = tx.isFixed || (tx.totalInstallments ?? 1) > 1;
    if (isRecurring) {
      setPendingDeleteRow(tx);
      setShowDeleteModal(true);
    } else {
      if (!window.confirm(`Deseja apagar "${tx.name}"?`)) return;
      const db = firebase.firestore();
      db.collection("users")
        .doc(user.uid)
        .collection("transactions")
        .doc(tx.id)
        .delete()
        .then(() => {
          addToast("Despesa excluída.", "success");
          loadTransactions(user.uid);
        })
        .catch(() => addToast("Erro ao excluir.", "error"));
    }
  };

  const confirmDelete = async (scope) => {
    const tx = pendingDeleteRow;
    setShowDeleteModal(false);
    setPendingDeleteRow(null);

    if (scope === "only_this") {
      await deleteOnlyThisMonth(tx);
      return;
    }

    const db = firebase.firestore();
    const txRef = db
      .collection("users")
      .doc(user.uid)
      .collection("transactions")
      .doc(tx.id);

    try {
      if (scope === "all") {
        await txRef.delete();
        addToast("Transação excluída completamente.", "success");
      } else {
        // "from_now"
        const master = masterTransactions.find((m) => m.id === tx.id);
        const [oy, om] = tx.monthKey.split("-").map(Number);
        const start =
          master?.startDate instanceof Date
            ? master.startDate
            : new Date(master?.startDate ?? Date.now());
        const updatedOverrides = { ...(master?.overrides ?? {}) };

        let iterY = oy,
          iterM = om - 1;
        while (true) {
          const k = monthKeyFor(iterY, iterM);
          updatedOverrides[k] = {
            ...(updatedOverrides[k] ?? {}),
            deleted: true,
          };
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
          if (master?.isFixed && iterY > oy + 10) break;
        }

        await txRef.update({
          overrides: updatedOverrides,
          history: firebase.firestore.FieldValue.arrayUnion(
            buildHistoryEntry(`Excluído a partir de ${tx.monthKey}`),
          ),
        });
        addToast("Transação removida deste mês em diante.", "success");
      }
      await loadTransactions(user.uid);
    } catch {
      addToast("Erro ao excluir.", "error");
    }
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

  const handleSaveNote = async (note) => {
    const tx = noteTargetTx;
    setShowNoteModal(false);
    setNoteTargetTx(null);
    const db = firebase.firestore();
    const master = masterTransactions.find((m) => m.id === tx.id);
    const existingOverride = master?.overrides?.[tx.monthKey] ?? {};
    try {
      await db
        .collection("users")
        .doc(user.uid)
        .collection("transactions")
        .doc(tx.id)
        .update({
          [`overrides.${tx.monthKey}`]: { ...existingOverride, note },
        });
      addToast("Observação salva!", "success");
      await loadTransactions(user.uid);
    } catch {
      addToast("Erro ao salvar observação.", "error");
    }
  };

  const exportCSV = () => {
    const rows = [
      [
        "Nome",
        "Categoria",
        "Tipo/Parcela",
        "Vencimento",
        "Dia Pag.",
        "Valor",
        "Status",
        "Observação",
      ],
      ...filteredTransactions.map((t) => [
        t.name,
        categories[t.category] ?? "—",
        t.isFixed
          ? "Fixa"
          : t.totalInstallments === 1
            ? "Avulsa"
            : `${t.installmentNumber}/${t.totalInstallments}x`,
        t.dueDate.toLocaleDateString("pt-BR"),
        `Dia ${t.datepay}`,
        t.amount.toFixed(2).replace(".", ","),
        t.isPaid ? "Pago" : "Pendente",
        t.note ?? "",
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `despesas_${mesesNome[currentMonth]}_${currentYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addToast("CSV exportado com sucesso!", "success");
  };

  // ── formEditData ───────────────────────────────────────────────────────────
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
        monthKey: editingVirtualRow.monthKey,
        baseAmount: editingVirtualRow.baseAmount,
        installmentNumber: editingVirtualRow.installmentNumber,
        totalInstallments: editingVirtualRow.totalInstallments,
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

  // ── Status visual (com fuso corrigido e alerta de vencimento próximo) ──────
  const getTransactionStatus = (tx) => {
    if (tx.isPaid)
      return (
        <span className="min-w-[80px] text-center inline-block px-2 py-1 rounded-full text-sm bg-green-800 bg-opacity-25 text-green-500">
          Pago
        </span>
      );
    const today = todayLocal();
    const due = new Date(
      tx.dueDate.getFullYear(),
      tx.dueDate.getMonth(),
      tx.dueDate.getDate(),
    );
    const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
    if (due < today)
      return (
        <span className="min-w-[80px] text-center inline-block px-2 py-1 rounded-full text-sm bg-red-800 bg-opacity-25 text-red-500">
          Atrasado
        </span>
      );
    if (diffDays <= 5)
      return (
        <span className="min-w-[110px] text-center inline-block px-2 py-1 rounded-full text-sm bg-orange-800 bg-opacity-25 text-orange-400">
          Vence em {diffDays}d
        </span>
      );
    return (
      <span className="min-w-[80px] text-center inline-block px-2 py-1 rounded-full text-sm bg-yellow-800 bg-opacity-25 text-yellow-400">
        Pendente
      </span>
    );
  };

  // ── Sub-componentes inline ─────────────────────────────────────────────────
  const Tooltip = ({ children, text }) => (
    <div className="relative group inline-block">
      {children}
      <div className="absolute z-50 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-black text-white text-xs rounded-md whitespace-nowrap pointer-events-none shadow-lg">
        {text}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black"></div>
      </div>
    </div>
  );

  const SortableTH = ({ label, sortKey }) => {
    const isActive = sortConfig.key === sortKey;
    const isAsc = sortConfig.direction === "asc";
    return (
      <th
        onClick={() => handleSort(sortKey)}
        className="py-3 px-4 md:px-6 text-left font-semibold text-sm cursor-pointer text-white hover:text-green-400 transition-colors select-none"
      >
        <div className="inline-flex items-center gap-1">
          {label}
          <i
            className={`bi ${isActive ? (isAsc ? "bi-arrow-up" : "bi-arrow-down") : "bi-arrow-down-up"}`}
          ></i>
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

      {/* ── Toasts ── */}
      <Toast toasts={toasts} />

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
              é uma conta {pendingEditRow.isFixed ? "fixa" : "parcelada"}.
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
                  Ex: a conta de água de {mesesNome[currentMonth]} teve um valor
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
                  Ex: o preço da anuidade subiu a partir de agora. O histórico
                  de meses passados é preservado.
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
            <p className="text-zinc-400 text-sm mb-5">
              <span className="text-white font-medium">
                "{pendingDeleteRow.name}"
              </span>{" "}
              é uma conta {pendingDeleteRow.isFixed ? "fixa" : "parcelada"}. O
              que deseja excluir?
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => confirmDelete("only_this")}
                className="text-left p-4 rounded-xl bg-zinc-700/60 hover:bg-zinc-700 border border-zinc-600 hover:border-red-500 transition-all group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <i className="bi bi-calendar-minus text-red-400"></i>
                  <span className="font-semibold group-hover:text-red-400 transition-colors">
                    Apenas este mês
                  </span>
                </div>
                <p className="text-xs text-zinc-400">
                  Remove somente {mesesNome[currentMonth]}. Os outros meses
                  continuam normalmente.
                </p>
              </button>
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
                  {mesesNome[currentMonth]} e os próximos serão removidos.
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
                  Remove completamente a transação, incluindo todo o histórico
                  de meses anteriores.
                </p>
              </button>
            </div>
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

      {/* ── Modal de nota ── */}
      {showNoteModal && noteTargetTx && (
        <NoteModal
          tx={noteTargetTx}
          onSave={handleSaveNote}
          onClose={() => {
            setShowNoteModal(false);
            setNoteTargetTx(null);
          }}
        />
      )}

      {/* ── Modal de histórico ── */}
      {showHistoryModal && historyTargetTx && (
        <HistoryModal
          tx={historyTargetTx}
          onClose={() => {
            setShowHistoryModal(false);
            setHistoryTargetTx(null);
          }}
        />
      )}

      {/* ── Pop-up de Atrasados ── */}
      {showOverduePopup && overdueTransactions.length > 0 && (
        <div className="fixed bottom-5 right-5 z-50 w-[calc(100%-2rem)] max-w-md animate-slide-up">
          <div className="bg-zinc-800/95 backdrop-blur-sm border-l-4 border-red-500 rounded-xl shadow-2xl overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-zinc-700">
              <div className="flex items-center gap-2">
                <i className="bi bi-exclamation-triangle-fill text-red-500 text-xl"></i>
                <h3 className="font-bold text-red-400">Dívidas Atrasadas</h3>
                <span className="bg-red-500/20 text-red-400 text-xs font-bold px-2 py-0.5 rounded-full">
                  {overdueTransactions.length}
                </span>
              </div>
              <button
                onClick={() => setShowOverduePopup(false)}
                className="text-zinc-400 hover:text-red-400 transition-colors"
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto custom-scroll p-2">
              {overdueTransactions.map((tx) => (
                <div
                  key={`${tx.id}-${tx.monthKey}`}
                  onClick={() => {
                    const [y, m] = tx.monthKey.split("-").map(Number);
                    setCurrentYear(y);
                    setCurrentMonth(m - 1);
                    setShowOverduePopup(false);
                  }}
                  className="flex justify-between items-center p-3 m-1 rounded-lg bg-zinc-700/50 hover:bg-zinc-700 cursor-pointer transition-all duration-150"
                >
                  <div className="flex-1">
                    <p className="font-medium text-sm">{tx.name}</p>
                    <p className="text-xs text-zinc-400">
                      Venc: {tx.dueDate.toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <p className="font-bold text-red-400">
                    {formatarMoeda(tx.amount)}
                  </p>
                </div>
              ))}
            </div>
            <div className="p-3 flex flex-col sm:flex-row gap-2 justify-between items-center border-t border-zinc-700 bg-zinc-800/50">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={dontShowAgainToday}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setDontShowAgainToday(checked);
                    if (checked)
                      localStorage.setItem(
                        "dontShowOverdueToday",
                        new Date().toDateString(),
                      );
                    else localStorage.removeItem("dontShowOverdueToday");
                  }}
                  className="rounded border-zinc-500 bg-zinc-700 text-green-500 focus:ring-green-500"
                />
                <span className="text-zinc-300">Não mostrar hoje</span>
              </label>
              <button
                onClick={() => setShowOverduePopup(false)}
                className="bg-red-500 hover:bg-red-600 text-white px-5 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-md"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Pop-up de Vencimentos Próximos ── */}
      {showUpcomingPopup &&
        upcomingTransactions.length > 0 &&
        !showOverduePopup && (
          <div className="fixed bottom-5 right-5 z-50 w-[calc(100%-2rem)] max-w-md">
            <div className="bg-zinc-800/95 backdrop-blur-sm border-l-4 border-orange-400 rounded-xl shadow-2xl overflow-hidden">
              <div className="flex justify-between items-center p-4 border-b border-zinc-700">
                <div className="flex items-center gap-2">
                  <i className="bi bi-bell-fill text-orange-400 text-lg"></i>
                  <h3 className="font-bold text-orange-300">
                    Vencendo em breve
                  </h3>
                  <span className="bg-orange-500/20 text-orange-400 text-xs font-bold px-2 py-0.5 rounded-full">
                    {upcomingTransactions.length}
                  </span>
                </div>
                <button
                  onClick={() => setShowUpcomingPopup(false)}
                  className="text-zinc-400 hover:text-orange-400 transition-colors"
                >
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto custom-scroll p-2">
                {upcomingTransactions.map((tx) => {
                  const today = todayLocal();
                  const due = new Date(
                    tx.dueDate.getFullYear(),
                    tx.dueDate.getMonth(),
                    tx.dueDate.getDate(),
                  );
                  const diffDays = Math.ceil(
                    (due - today) / (1000 * 60 * 60 * 24),
                  );
                  return (
                    <div
                      key={`${tx.id}-${tx.monthKey}`}
                      className="flex justify-between items-center p-3 m-1 rounded-lg bg-zinc-700/50"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-sm">{tx.name}</p>
                        <p className="text-xs text-orange-400">
                          Vence{" "}
                          {diffDays === 0
                            ? "hoje"
                            : `em ${diffDays} dia${diffDays > 1 ? "s" : ""}`}
                        </p>
                      </div>
                      <p className="font-bold text-orange-300">
                        {formatarMoeda(tx.amount)}
                      </p>
                    </div>
                  );
                })}
              </div>
              <div className="p-3 flex justify-end border-t border-zinc-700 bg-zinc-800/50">
                <button
                  onClick={() => setShowUpcomingPopup(false)}
                  className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-1.5 rounded-lg text-sm font-medium transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* ── Cabeçalho ── */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <i className="bi bi-receipt text-green-500 text-2xl"></i>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-green-400 to-green-600 bg-clip-text text-transparent">
              Despesas
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip text="Exportar CSV">
              <button
                onClick={exportCSV}
                className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 hover:text-green-400 transition-all"
              >
                <i className="bi bi-download text-lg"></i>
              </button>
            </Tooltip>
            <Tooltip text={showGrafico ? "Ocultar gráfico" : "Mostrar gráfico"}>
              <button
                onClick={() => setShowGrafico((v) => !v)}
                className={`p-2 rounded-xl border transition-all ${showGrafico ? "bg-green-500/10 border-green-600 text-green-400" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-green-400"}`}
              >
                <i className="bi bi-bar-chart-line text-lg"></i>
              </button>
            </Tooltip>
            <Tooltip text="Adicionar nova despesa">
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
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 custom-scroll">
          {/* ── Cartões de resumo ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="bg-gradient-to-br from-zinc-800 to-zinc-800/80 p-5 rounded-2xl shadow-lg border border-white/5 hover:border-green-500/30 transition-all duration-300 group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="bi bi-calendar-day text-green-400 text-xl"></i>
                  <h3 className="font-semibold">Despesas do Dia 01</h3>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-zinc-700 text-zinc-300">
                  {resumoCartoes.qtd01} pendente(s)
                </span>
              </div>
              <p className="text-3xl font-bold mt-3 text-red-400 group-hover:text-red-300 transition-colors">
                {formatarMoeda(resumoCartoes.dia01)}
              </p>
            </div>
            <div className="bg-gradient-to-br from-zinc-800 to-zinc-800/80 p-5 rounded-2xl shadow-lg border border-white/5 hover:border-green-500/30 transition-all duration-300 group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="bi bi-calendar-week text-green-400 text-xl"></i>
                  <h3 className="font-semibold">Despesas do Dia 15</h3>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-zinc-700 text-zinc-300">
                  {resumoCartoes.qtd15} pendente(s)
                </span>
              </div>
              <p className="text-3xl font-bold mt-3 text-red-400 group-hover:text-red-300 transition-colors">
                {formatarMoeda(resumoCartoes.dia15)}
              </p>
            </div>
          </div>

          {/* ── Gráfico ── */}
          {showGrafico && (
            <GraficoEvolucao
              masterTransactions={masterTransactions}
              categories={categories}
              currentYear={currentYear}
              currentMonth={currentMonth}
            />
          )}

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
                  <span className="text-sm text-zinc-500 font-normal">
                    ({filteredTransactions.length})
                  </span>
                </h2>
                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                  <div className="relative">
                    <button
                      onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
                      className="flex items-center justify-between gap-2 px-4 py-2 bg-zinc-700/70 rounded-xl border border-zinc-600 hover:bg-zinc-700 transition-all"
                    >
                      <i className="bi bi-funnel"></i>
                      <span className="text-sm font-medium">Filtros</span>
                      {(filterStatus || filterCategory || filterDatepay) && (
                        <span className="w-2 h-2 rounded-full bg-green-400 shrink-0"></span>
                      )}
                      <i
                        className={`bi bi-chevron-down transition-transform duration-200 ${isFilterMenuOpen ? "rotate-180" : ""}`}
                      ></i>
                    </button>
                    {isFilterMenuOpen && (
                      <div className="absolute right-0 mt-2 w-64 bg-zinc-800 rounded-xl shadow-2xl border border-zinc-700 z-30 animate-fade-in">
                        <div className="p-3 space-y-3">
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-1">
                              Status
                            </label>
                            <select
                              value={filterStatus}
                              onChange={(e) => setFilterStatus(e.target.value)}
                              className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
                            >
                              <option value="">Todos</option>
                              <option value="paid">Pago</option>
                              <option value="unpaid">Pendente</option>
                            </select>
                          </div>
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
                              setFilterStatus("");
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
              <table className="min-w-[900px] w-full">
                <thead className="bg-zinc-800/80 text-xs uppercase tracking-wider">
                  <tr>
                    <SortableTH label="Nome" sortKey="name" />
                    <th className="py-3 px-4 text-left font-semibold text-xs">
                      Tipo
                    </th>
                    <SortableTH label="Categoria" sortKey="category" />
                    <SortableTH label="Vencimento" sortKey="dueDate" />
                    <SortableTH label="Dia Pag." sortKey="datepay" />
                    <SortableTH label="Valor" sortKey="amount" />
                    <th className="py-3 px-4 text-left font-semibold text-xs">
                      Tipo/Parcela
                    </th>
                    <th className="py-3 px-4 text-left font-semibold text-xs">
                      Situação
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
                        colSpan="9"
                        className="text-center py-12 text-zinc-500"
                      >
                        <i className="bi bi-inbox text-4xl block mb-2"></i>
                        Nenhuma despesa encontrada para este período.
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
                          <div className="flex items-center gap-1.5">
                            <Tooltip
                              text={
                                tx.isPaid
                                  ? "Desmarcar como pago"
                                  : "Marcar como pago"
                              }
                            >
                              <span className="cursor-pointer">{tx.name}</span>
                            </Tooltip>
                            {tx.note && (
                              <Tooltip text={tx.note}>
                                <i className="bi bi-sticky text-yellow-400 text-xs cursor-default shrink-0"></i>
                              </Tooltip>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full text-xs bg-red-900/30 text-red-400">
                            Gasto
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
                        <td className="py-3 px-4">
                          {getTransactionStatus(tx)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex justify-center gap-1">
                            <Tooltip text="Editar">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditClick(tx);
                                }}
                                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all"
                              >
                                <i className="bi bi-pencil-square text-sm"></i>
                              </button>
                            </Tooltip>
                            <Tooltip
                              text={
                                tx.note
                                  ? "Editar observação"
                                  : "Adicionar observação"
                              }
                            >
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setNoteTargetTx(tx);
                                  setShowNoteModal(true);
                                }}
                                className={`p-1.5 rounded-lg transition-all ${tx.note ? "text-yellow-400 hover:bg-yellow-400/10" : "text-zinc-400 hover:text-yellow-400 hover:bg-zinc-700"}`}
                              >
                                <i className="bi bi-sticky text-sm"></i>
                              </button>
                            </Tooltip>
                            <Tooltip text="Histórico de alterações">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const master = masterTransactions.find(
                                    (m) => m.id === tx.id,
                                  );
                                  setHistoryTargetTx({
                                    ...tx,
                                    history: master?.history ?? [],
                                  });
                                  setShowHistoryModal(true);
                                }}
                                className="p-1.5 rounded-lg text-zinc-400 hover:text-blue-400 hover:bg-zinc-700 transition-all"
                              >
                                <i className="bi bi-clock-history text-sm"></i>
                              </button>
                            </Tooltip>
                            <Tooltip text="Excluir">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteTransaction(tx);
                                }}
                                className="p-1.5 rounded-lg text-red-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                              >
                                <i className="bi bi-trash3 text-sm"></i>
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
                      {formatarMoeda(totalTabela)}
                    </td>
                    <td colSpan="2" className="py-3 px-4">
                      {filteredTransactions.length} transações
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* ── Paginação ── */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-3 border-t border-zinc-700/50 bg-zinc-800/30">
                <p className="text-xs text-zinc-500">
                  Mostrando {(page - 1) * PAGE_SIZE + 1}–
                  {Math.min(page * PAGE_SIZE, filteredTransactions.length)} de{" "}
                  {filteredTransactions.length}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 rounded-lg text-sm bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <i className="bi bi-chevron-left"></i>
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                    (p) => (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${p === page ? "bg-green-500 text-white font-bold" : "bg-zinc-700 hover:bg-zinc-600"}`}
                      >
                        {p}
                      </button>
                    ),
                  )}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 rounded-lg text-sm bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <i className="bi bi-chevron-right"></i>
                  </button>
                </div>
              </div>
            )}
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
        transactionType="Gasto"
        editScope={editScope}
        isSaving={isSaving}
      />
    </div>
  );
}
