import React, {
  useEffect,
  useState,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { useNavigate } from "react-router-dom";
import firebase from "firebase/compat/app";
import { auth } from "../firebase/config";
import Sidebar from "../components/Sidebar";
import DashboardCharts from "../components/DashboardCharts";
import { formatarMoeda } from "../utils/format";
import Loading from "../components/Loading";
import { usePushNotification } from "../hooks/usePushNotification";

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
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function todayLocal() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

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
// COMPONENTE: Painel de Notificações
// ─────────────────────────────────────────────────────────────────────────────

function NotificationPanel({
  overdueAlerts,
  upcomingAlerts,
  onClose,
  permission,
  isSubscribed,
  onSubscribe,
  onUnsubscribe,
  onTransactionClick,
}) {
  const panelRef = useRef(null);
  const totalCount = overdueAlerts.length + upcomingAlerts.length;

  useEffect(() => {
    function handler(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        onClose();
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener("click", handler);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handler);
    };
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      onClick={(e) => e.stopPropagation()}
      className="absolute right-0 top-12 w-80 bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <span className="font-semibold text-white flex items-center gap-2">
          <i className="bi bi-bell-fill text-[#22C55E]"></i>
          Notificações
          {totalCount > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">
              {totalCount}
            </span>
          )}
        </span>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-white transition-colors"
        >
          <i className="bi bi-x-lg text-sm"></i>
        </button>
      </div>

      <div className="max-h-80 overflow-y-auto custom-scroll">
        {overdueAlerts.map((tx) => (
          <div
            key={`ov-${tx.id}-${tx.monthKey}`}
            onClick={() => onTransactionClick(tx)}
            className="flex items-start gap-3 px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
          >
            <div className="w-8 h-8 rounded-full bg-red-500/15 flex items-center justify-center shrink-0 mt-0.5">
              <i className="bi bi-exclamation-circle-fill text-red-400 text-sm"></i>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                {tx.name}
              </p>
              <p className="text-xs text-red-400 mt-0.5">
                Atrasada • {tx.dueDate.toLocaleDateString("pt-BR")}
              </p>
              <p className="text-xs text-zinc-400">
                {formatarMoeda(tx.amount)}
              </p>
            </div>
          </div>
        ))}

        {upcomingAlerts.map((tx) => {
          const diasRestantes = Math.ceil(
            (tx.dueDate.getTime() - todayLocal().getTime()) /
              (1000 * 60 * 60 * 24),
          );
          return (
            <div
              key={`up-${tx.id}-${tx.monthKey}`}
              onClick={() => onTransactionClick(tx)}
              className="flex items-start gap-3 px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
            >
              <div className="w-8 h-8 rounded-full bg-yellow-500/15 flex items-center justify-center shrink-0 mt-0.5">
                <i className="bi bi-clock-fill text-yellow-400 text-sm"></i>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                  {tx.name}
                </p>
                <p className="text-xs text-yellow-400 mt-0.5">
                  Vence{" "}
                  {diasRestantes === 0
                    ? "hoje"
                    : `em ${diasRestantes} dia${diasRestantes > 1 ? "s" : ""}`}
                </p>
                <p className="text-xs text-zinc-400">
                  {formatarMoeda(tx.amount)}
                </p>
              </div>
            </div>
          );
        })}

        {totalCount === 0 && (
          <div className="py-8 text-center text-zinc-500">
            <i className="bi bi-check-circle text-3xl block mb-2 text-green-500"></i>
            <p className="text-sm">Tudo em dia! 🎉</p>
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-white/10 bg-zinc-800/50">
        {permission === "denied" ? (
          <p className="text-xs text-red-400 text-center">
            <i className="bi bi-bell-slash mr-1"></i>
            Notificações bloqueadas nas configurações do navegador.
          </p>
        ) : isSubscribed ? (
          <div className="flex items-center justify-between">
            <span className="text-xs text-green-400 flex items-center gap-1">
              <i className="bi bi-bell-fill"></i>
              Push ativo no celular
            </span>
            <button
              onClick={onUnsubscribe}
              className="text-xs text-zinc-400 hover:text-red-400 transition-colors"
            >
              Desativar
            </button>
          </div>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSubscribe();
            }}
            className="w-full py-2 bg-[#22C55E] hover:bg-[#1ea951] text-black text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <i className="bi bi-bell-fill"></i>
            Ativar notificações no celular
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL: Dashboard
// ─────────────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCalendar, setShowCalendar] = useState(false);
  const [mobileChartTab, setMobileChartTab] = useState("despesas");
  const [searchTerm, setSearchTerm] = useState("");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [masterTransactions, setMasterTransactions] = useState([]);
  const [categories, setCategories] = useState({});
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  // Estado para controlar o Menu de "+" do Mobile
  const [showAddMenu, setShowAddMenu] = useState(false);

  const [totais, setTotais] = useState({
    receitas: 0,
    despesas: 0,
    sobra: 0,
    rec01: 0,
    rec15: 0,
    desp01: 0,
    desp15: 0,
  });

  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const bellRef = useRef(null);

  const {
    permission,
    isSubscribed,
    swReady,
    subscribe,
    unsubscribe,
    notifyLocal,
  } = usePushNotification(user?.uid);

  // ── Resize ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ── Auth ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((currentUser) => {
      if (currentUser) {
        setUser({
          uid: currentUser.uid,
          name: currentUser.displayName || currentUser.email.split("@")[0],
          email: currentUser.email,
        });
      } else {
        navigate("/");
      }
    });
    return () => unsub();
  }, [navigate]);

  // ── Carrega dados ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const db = firebase.firestore();
    const userRef = db.collection("users").doc(user.uid);
    setIsLoading(true);
    Promise.all([
      userRef.collection("transactions").get(),
      userRef.collection("categories").get(),
    ])
      .then(([transSnapshot, catsSnapshot]) => {
        const transacoesDB = transSnapshot.docs.map((doc) =>
          normalizeMaster(doc.data(), doc.id),
        );
        setMasterTransactions(transacoesDB);
        const catsMap = {};
        catsSnapshot.forEach((doc) => {
          catsMap[doc.id] = doc.data().name;
        });
        setCategories(catsMap);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [user]);

  // ── Expansão ─────────────────────────────────────────────────────────────
  const expandedTransactions = useMemo(() => {
    const meses =
      currentMonth === "all"
        ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
        : [currentMonth];
    const expanded = [];
    masterTransactions.forEach((master) => {
      meses.forEach((mes) => {
        const tx = expandMasterForMonth(master, currentYear, mes);
        if (tx) expanded.push(tx);
      });
    });
    return expanded;
  }, [masterTransactions, currentMonth, currentYear]);

  const filteredTransactions = useMemo(() => {
    if (!searchTerm) return expandedTransactions;
    const term = searchTerm.toLowerCase();
    return expandedTransactions.filter((t) => {
      const catName = categories[t.category]?.toLowerCase() || "";
      return (
        t.name.toLowerCase().includes(term) ||
        catName.includes(term) ||
        t.type.toLowerCase().includes(term)
      );
    });
  }, [expandedTransactions, searchTerm, categories]);

  // ── Alertas atrasados ────────────────────────────────────────────────────
  const overdueAlerts = useMemo(() => {
    const today = todayLocal();
    const overdue = [];
    for (const master of masterTransactions) {
      if (master.type !== "Gasto") continue;
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
    return overdue;
  }, [masterTransactions]);

  // ── Alertas próximos (5 dias) ────────────────────────────────────────────
  const upcomingAlerts = useMemo(() => {
    const today = todayLocal();
    const soon = new Date(today);
    soon.setDate(soon.getDate() + 5);
    return expandedTransactions.filter((tx) => {
      if (tx.type !== "Gasto" || tx.isPaid) return false;
      const dueLocal = new Date(
        tx.dueDate.getFullYear(),
        tx.dueDate.getMonth(),
        tx.dueDate.getDate(),
      );
      return dueLocal >= today && dueLocal <= soon;
    });
  }, [expandedTransactions]);

  const totalAlerts = overdueAlerts.length + upcomingAlerts.length;

  // ── Notificação local automática 1x por dia ──────────────────────────────
  useEffect(() => {
    if (!masterTransactions.length) return;
    const todayStr = new Date().toDateString();
    const storedKey = `notifSentDashboard_${user?.uid}`;
    if (localStorage.getItem(storedKey) === todayStr) return;

    if (overdueAlerts.length > 0 || upcomingAlerts.length > 0) {
      const msgs = [];
      if (overdueAlerts.length > 0)
        msgs.push(`${overdueAlerts.length} despesa(s) atrasada(s)`);
      if (upcomingAlerts.length > 0)
        msgs.push(`${upcomingAlerts.length} vence(m) nos próximos 5 dias`);
      notifyLocal("💸 Alerta Financeiro", msgs.join(" • "), "/despesas");
      localStorage.setItem(storedKey, todayStr);
    }
  }, [
    overdueAlerts,
    upcomingAlerts,
    notifyLocal,
    user,
    masterTransactions.length,
  ]);

  // ── Handler push ─────────────────────────────────────────────────────────
  const handleSubscribe = useCallback(async () => {
    const ok = await subscribe();
    if (!ok && Notification.permission === "denied") {
      alert(
        "Você bloqueou as notificações. Habilite clicando no cadeado 🔒 na barra de endereço.",
      );
    }
  }, [subscribe]);

  // ── Cálculos ─────────────────────────────────────────────────────────────
  const chartTransactions = useMemo(() => {
    if (isMobile) {
      return filteredTransactions.filter((t) =>
        mobileChartTab === "despesas"
          ? t.type === "Gasto"
          : t.type === "Receita" || t.type === "Ganho",
      );
    }
    return filteredTransactions;
  }, [filteredTransactions, isMobile, mobileChartTab]);

  useEffect(() => {
    let rec = 0,
      desp = 0,
      rec01 = 0,
      rec15 = 0,
      desp01 = 0,
      desp15 = 0;
    filteredTransactions.forEach((t) => {
      const amount = Number(t.amount) || 0;
      if (t.type === "Ganho" || t.type === "Receita") {
        rec += amount;
        if (t.datepay === "01") rec01 += amount;
        if (t.datepay === "15") rec15 += amount;
      }
      if (t.type === "Gasto") {
        desp += amount;
        if (t.datepay === "01") desp01 += amount;
        if (t.datepay === "15") desp15 += amount;
      }
    });
    setTotais({
      receitas: rec,
      despesas: desp,
      sobra: rec - desp,
      rec01,
      rec15,
      desp01,
      desp15,
    });
  }, [filteredTransactions]);

  const recentTransactions = useMemo(
    () =>
      [...filteredTransactions]
        .sort((a, b) => b.dueDate - a.dueDate)
        .slice(0, 5),
    [filteredTransactions],
  );

  const topCategories = useMemo(() => {
    const expensesByCategory = {};
    filteredTransactions.forEach((t) => {
      if (t.type === "Gasto")
        expensesByCategory[t.category] =
          (expensesByCategory[t.category] || 0) + Number(t.amount);
    });
    return Object.entries(expensesByCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [filteredTransactions]);

  const getPieChartStyle = () => {
    const colors = ["#3b82f6", "#ef4444", "#a855f7", "#22c55e", "#f59e0b"];
    let start = 0;
    const total = totais.despesas > 0 ? totais.despesas : 1;
    const stops = topCategories.map(([, amount], i) => {
      const perc = (amount / total) * 100;
      const stop = `${colors[i % colors.length]} ${start}% ${start + perc}%`;
      start += perc;
      return stop;
    });
    if (start < 100) stops.push(`#3f3f46 ${start}% 100%`);
    return { background: `conic-gradient(${stops.join(", ")})` };
  };

  if (!user) return <div className="bg-[#121212] h-screen"></div>;

  return (
    <div className="bg-[#121212] lg:bg-zinc-900 text-zinc-200 h-screen flex flex-col lg:grid lg:grid-cols-[auto,1fr] font-['Inter'] overflow-hidden">
      {isLoading && <Loading />}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* ─── CABEÇALHO DESKTOP ─── */}
        <header className="hidden lg:flex sticky top-0 z-10 items-center justify-between px-6 py-4 bg-zinc-900/80 backdrop-blur-sm border-b border-white/10">
          <div>
            <h1 className="text-2xl font-bold">
              Bem-vindo de volta,{" "}
              <span className="text-green-500">{user.name}</span>! 👋
            </h1>
            <p className="text-zinc-400 text-sm mt-1">
              Seu painel financeiro inteligente
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-64">
              <i className="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"></i>
              <input
                type="text"
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-zinc-800 border border-white/5 rounded-xl py-2 pl-10 pr-4 text-sm focus:ring-1 focus:ring-green-500 outline-none"
              />
            </div>

            {/* ─── SININHO DESKTOP ─── */}
            <div className="relative" ref={bellRef}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowNotifPanel((v) => !v);
                }}
                className="relative p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 transition-colors"
              >
                <i className="bi bi-bell-fill text-[20px] text-zinc-300"></i>
                {totalAlerts > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full h-[18px] w-[18px] flex items-center justify-center border-2 border-zinc-900">
                    {totalAlerts > 9 ? "9+" : totalAlerts}
                  </span>
                )}
              </button>

              {showNotifPanel && (
                <NotificationPanel
                  overdueAlerts={overdueAlerts}
                  upcomingAlerts={upcomingAlerts}
                  onClose={() => setShowNotifPanel(false)}
                  permission={permission}
                  isSubscribed={isSubscribed}
                  onSubscribe={handleSubscribe}
                  onUnsubscribe={unsubscribe}
                  onTransactionClick={(tx) => {
                    navigate(tx.type === "Gasto" ? "/despesas" : "/receitas", {
                      state: { highlightTxId: tx.id },
                    });
                    setShowNotifPanel(false); // Fecha o painel após clicar
                  }}
                />
              )}
            </div>
          </div>
        </header>

        {/* ─── SCROLL PRINCIPAL ─── */}
        <main className="flex-1 overflow-y-auto pb-[100px] lg:pb-6 custom-scroll">
          {/* ─── CABEÇALHO MOBILE ─── */}
          <div className="lg:hidden flex flex-col px-5 pt-10 pb-6 bg-gradient-to-br from-[#1C261D] to-[#121212]">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h1 className="text-[24px] font-bold text-white flex items-center gap-2">
                  Olá, {user.name} <span className="text-[24px]">👋</span>
                </h1>
                <p className="text-zinc-400 text-[14px] mt-1 font-medium">
                  Bem-vindo de volta
                </p>
              </div>

              {/* ─── SININHO MOBILE ─── */}
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowNotifPanel((v) => !v);
                  }}
                  className="relative p-2"
                >
                  <i className="bi bi-bell-fill text-[24px] text-zinc-300"></i>
                  {totalAlerts > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full h-[18px] w-[18px] flex items-center justify-center border-2 border-[#121212]">
                      {totalAlerts > 9 ? "9+" : totalAlerts}
                    </span>
                  )}
                </button>

                {showNotifPanel && (
                  <NotificationPanel
                    overdueAlerts={overdueAlerts}
                    upcomingAlerts={upcomingAlerts}
                    onClose={() => setShowNotifPanel(false)}
                    permission={permission}
                    isSubscribed={isSubscribed}
                    onSubscribe={handleSubscribe}
                    onUnsubscribe={unsubscribe}
                    onTransactionClick={(tx) => {
                      navigate(
                        tx.type === "Gasto" ? "/despesas" : "/receitas",
                        {
                          state: { highlightTxId: tx.id },
                        },
                      );
                      setShowNotifPanel(false);
                    }}
                  />
                )}
              </div>
            </div>

            <div className="relative">
              <i className="bi bi-search absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-lg"></i>
              <input
                type="text"
                placeholder="Buscar transações..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#1C1C1E] border border-white/5 rounded-xl py-3.5 pl-12 pr-4 text-sm text-white focus:ring-1 focus:ring-green-500 outline-none shadow-sm"
              />
            </div>
          </div>

          <div className="p-4 md:p-6 flex flex-col gap-6">
            {/* ─── FILTRO DE PERÍODO ─── */}
            <div className="relative z-20">
              <button
                onClick={() => setShowCalendar(!showCalendar)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 bg-[#1C1C1E] lg:bg-zinc-800 text-sm font-medium text-zinc-300 shadow-sm"
              >
                <i className="bi bi-calendar3 text-[#22C55E]"></i>
                {currentMonth === "all"
                  ? "Todos os Períodos"
                  : `${mesesNome[currentMonth]} de ${currentYear}`}
                <i className="bi bi-chevron-down ml-1 text-zinc-500"></i>
              </button>
              {showCalendar && (
                <div className="absolute top-14 left-0 bg-[#1C1C1E] border border-white/10 rounded-2xl shadow-2xl p-4 w-72 animate-fade-in">
                  <div className="flex justify-between items-center mb-4">
                    <button
                      onClick={() => setCurrentYear((y) => y - 1)}
                      className="p-1 px-2 rounded bg-zinc-800"
                    >
                      <i className="bi bi-chevron-left"></i>
                    </button>
                    <span className="text-lg font-bold">{currentYear}</span>
                    <button
                      onClick={() => setCurrentYear((y) => y + 1)}
                      className="p-1 px-2 rounded bg-zinc-800"
                    >
                      <i className="bi bi-chevron-right"></i>
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <button
                      onClick={() => {
                        setCurrentMonth("all");
                        setShowCalendar(false);
                      }}
                      className={`col-span-4 p-2 rounded-lg text-sm ${currentMonth === "all" ? "bg-[#22C55E] text-white" : "bg-zinc-800"}`}
                    >
                      Ano Inteiro
                    </button>
                    {mesesNome.map((mes, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setCurrentMonth(index);
                          setShowCalendar(false);
                        }}
                        className={`p-2 rounded-lg text-sm ${currentMonth === index ? "bg-[#22C55E] text-white" : "bg-zinc-800"}`}
                      >
                        {mes.substring(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ─── CARDS DE RESUMO ─── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
              <div className="bg-gradient-to-br from-[#1C261D] to-[#141B15] rounded-[20px] p-6 shadow-md border border-green-500/10">
                <div className="flex items-center gap-3 mb-2">
                  <div className="bg-green-500/20 p-2 rounded-lg">
                    <i
                      className={`bi ${totais.sobra >= 0 ? "bi-graph-up text-[#22C55E]" : "bi-graph-down text-red-500"} text-lg`}
                    ></i>
                  </div>
                  <span className="font-semibold text-zinc-300 text-sm">
                    Saldo Atual
                  </span>
                </div>
                <p className="text-[32px] font-bold text-white">
                  {formatarMoeda(totais.sobra)}
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-2 col-span-1 md:col-span-2 gap-4">
                <div className="bg-[#1C1C1E] lg:bg-zinc-800 rounded-[20px] p-5 border border-[#22C55E]/20 shadow-sm">
                  <div className="flex items-center gap-2 mb-2 text-zinc-400">
                    <div className="bg-[#22C55E]/10 p-1.5 rounded-lg">
                      <i className="bi bi-arrow-up text-[#22C55E] text-sm"></i>
                    </div>
                    <span className="text-xs font-semibold">Receitas</span>
                  </div>
                  <p className="text-[20px] lg:text-[24px] font-bold text-[#22C55E]">
                    {formatarMoeda(totais.receitas)}
                  </p>
                </div>
                <div className="bg-[#1C1C1E] lg:bg-zinc-800 rounded-[20px] p-5 border border-[#EF4444]/20 shadow-sm">
                  <div className="flex items-center gap-2 mb-2 text-zinc-400">
                    <div className="bg-[#EF4444]/10 p-1.5 rounded-lg">
                      <i className="bi bi-arrow-down text-[#EF4444] text-sm"></i>
                    </div>
                    <span className="text-xs font-semibold">Despesas</span>
                  </div>
                  <p className="text-[20px] lg:text-[24px] font-bold text-[#EF4444]">
                    {formatarMoeda(totais.despesas)}
                  </p>
                </div>
              </div>
            </div>

            {/* ─── GRÁFICO ─── */}
            {!searchTerm && (
              <div className="bg-[#1C1C1E] lg:bg-zinc-800 rounded-[24px] p-5 shadow-md border border-white/5">
                <div className="lg:hidden flex justify-center mb-6">
                  <div className="flex bg-[#121212] p-1.5 rounded-xl border border-white/5">
                    <button
                      onClick={() => setMobileChartTab("despesas")}
                      className={`px-6 py-2 text-[13px] font-bold rounded-lg flex items-center gap-2 transition-all ${mobileChartTab === "despesas" ? "bg-[#EF4444] text-white" : "text-zinc-500"}`}
                    >
                      <i className="bi bi-arrow-down"></i> Despesas
                    </button>
                    <button
                      onClick={() => setMobileChartTab("receitas")}
                      className={`px-6 py-2 text-[13px] font-bold rounded-lg flex items-center gap-2 transition-all ${mobileChartTab === "receitas" ? "bg-[#22C55E] text-white" : "text-zinc-500"}`}
                    >
                      <i className="bi bi-arrow-up"></i> Receitas
                    </button>
                  </div>
                </div>
                <div className="flex justify-between items-end mb-6 px-2">
                  <h3 className="font-bold text-white text-[16px]">
                    <span className="lg:hidden">
                      {mobileChartTab === "despesas"
                        ? "Visão de Despesas"
                        : "Visão de Receitas"}
                    </span>
                    <span className="hidden lg:inline">Visão Geral do Ano</span>
                  </h3>
                  <div className="text-right">
                    <p className="text-[11px] text-zinc-400 font-bold mb-0.5">
                      {currentMonth === "all"
                        ? "Ano Inteiro"
                        : mesesNome[currentMonth]}
                    </p>
                    <p
                      className={`font-bold text-[15px] ${isMobile ? (mobileChartTab === "despesas" ? "text-[#EF4444]" : "text-[#22C55E]") : "text-white"}`}
                    >
                      {formatarMoeda(
                        isMobile
                          ? mobileChartTab === "despesas"
                            ? totais.despesas
                            : totais.receitas
                          : totais.receitas - totais.despesas,
                      )}
                    </p>
                  </div>
                </div>
                <div className="w-full min-h-[220px]">
                  <DashboardCharts
                    transactions={chartTransactions}
                    currentMonth={currentMonth}
                    currentYear={currentYear}
                    onMonthSelect={(monthIndex, year) => {
                      setCurrentMonth(monthIndex);
                      if (year) setCurrentYear(year);
                    }}
                    activeTab={mobileChartTab}
                  />
                </div>
              </div>
            )}

            {/* ─── GASTOS POR CATEGORIA ─── */}
            {!searchTerm && topCategories.length > 0 && (
              <div className="bg-[#1C1C1E] lg:bg-zinc-800 rounded-[24px] p-6 shadow-md border border-white/5">
                <h3 className="text-[18px] font-semibold text-white mb-6">
                  Gastos por Categoria
                </h3>
                <div className="flex flex-col md:flex-row items-center gap-8">
                  <div
                    className="relative w-48 h-48 flex-shrink-0 rounded-full flex items-center justify-center shadow-lg"
                    style={getPieChartStyle()}
                  >
                    <div className="w-36 h-36 bg-[#1C1C1E] lg:bg-zinc-800 rounded-full flex flex-col items-center justify-center shadow-inner">
                      <span className="text-zinc-400 text-xs uppercase tracking-wider">
                        Total
                      </span>
                      <span className="text-xl font-bold text-white mt-1">
                        100%
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 w-full space-y-3">
                    {topCategories.map(([catId, amount], i) => {
                      const colors = [
                        "#3b82f6",
                        "#ef4444",
                        "#a855f7",
                        "#22c55e",
                        "#f59e0b",
                      ];
                      const color = colors[i % colors.length];
                      const catName = categories[catId] || catId;
                      const perc =
                        totais.despesas > 0
                          ? ((amount / totais.despesas) * 100).toFixed(1)
                          : 0;
                      return (
                        <div
                          key={catId}
                          className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="w-8 h-8 rounded-lg flex items-center justify-center"
                              style={{ backgroundColor: `${color}33`, color }}
                            >
                              <i className="bi bi-tag-fill text-sm"></i>
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-white">
                                {catName}
                              </p>
                              <p className="text-xs text-zinc-400">{perc}%</p>
                            </div>
                          </div>
                          <p className="text-sm font-bold text-white">
                            {formatarMoeda(amount)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ─── TRANSAÇÕES RECENTES ─── */}
            <div className="bg-[#1C1C1E] lg:bg-zinc-800 rounded-[24px] p-6 shadow-md border border-white/5">
              <h3 className="text-[18px] font-semibold text-white mb-6">
                {searchTerm
                  ? `Resultados da Busca (${recentTransactions.length})`
                  : "Transações Recentes"}
              </h3>
              {recentTransactions.length === 0 ? (
                <div className="text-center py-8 text-zinc-500">
                  <i className="bi bi-receipt text-4xl mb-2"></i>
                  <p className="text-sm">Nenhuma transação encontrada.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentTransactions.map((tx) => {
                    const isIncome =
                      tx.type === "Receita" || tx.type === "Ganho";
                    const catName = categories[tx.category] || "Outros";
                    return (
                      <div
                        key={`${tx.id}-${tx.monthKey}`}
                        onClick={() =>
                          navigate(isIncome ? "/receitas" : "/despesas", {
                            state: { highlightTxId: tx.id },
                          })
                        }
                        className="flex items-center justify-between p-4 rounded-xl bg-[#121212] lg:bg-white/5 border border-white/5 hover:bg-white/10 transition cursor-pointer"
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className={`p-2.5 rounded-xl ${isIncome ? "bg-[#22C55E]/10 text-[#22C55E]" : "bg-[#EF4444]/10 text-[#EF4444]"}`}
                          >
                            <i
                              className={`bi ${isIncome ? "bi-arrow-up" : "bi-arrow-down"} text-lg`}
                            ></i>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {tx.name}
                            </p>
                            <p className="text-xs text-zinc-400 mt-0.5">
                              {catName}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p
                            className={`text-sm font-bold ${isIncome ? "text-[#22C55E]" : "text-[#EF4444]"}`}
                          >
                            {formatarMoeda(tx.amount)}
                          </p>
                          <p className="text-[11px] text-zinc-500 mt-1">
                            {tx.dueDate.toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* ─── BOTTOM NAVIGATION MOBILE ─── */}
      <nav className="lg:hidden fixed bottom-0 w-full bg-[#1A1A1A] px-6 py-2 pb-4 flex justify-between items-center z-50 rounded-t-3xl shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.8)] border-t border-white/5">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex flex-col items-center text-[#22C55E]"
        >
          <i className="bi bi-house-door-fill text-[24px]"></i>
          <span className="text-[10px] mt-1 font-bold">Início</span>
        </button>
        <button
          onClick={() => navigate("/despesas")}
          className="flex flex-col items-center text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <i className="bi bi-arrow-down text-[24px]"></i>
          <span className="text-[10px] mt-1 font-medium">Despesas</span>
        </button>

        {/* ─── MENU FLUTUANTE DE AÇÃO (FAB) ─── */}
        <div className="relative -top-7 flex justify-center">
          {showAddMenu && (
            <>
              {/* Overlay que fecha o menu ao clicar fora */}
              <div
                className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
                onClick={() => setShowAddMenu(false)}
                style={{ height: "100vh", width: "100vw", top: 0, left: 0 }}
              ></div>

              {/* Botões do Menu Flutuante */}
              <div className="absolute bottom-[85px] flex flex-col items-center gap-4 z-50 animate-fade-in w-40">
                <button
                  onClick={() => navigate("/receitas")}
                  className="w-full bg-[#22C55E] text-black py-3 rounded-2xl font-bold shadow-xl flex items-center justify-center gap-2 text-sm active:scale-95 transition-transform"
                >
                  <i className="bi bi-arrow-up-circle-fill text-lg"></i> Nova
                  Receita
                </button>
                <button
                  onClick={() => navigate("/despesas")}
                  className="w-full bg-[#EF4444] text-white py-3 rounded-2xl font-bold shadow-xl flex items-center justify-center gap-2 text-sm active:scale-95 transition-transform"
                >
                  <i className="bi bi-arrow-down-circle-fill text-lg"></i> Nova
                  Despesa
                </button>
              </div>
            </>
          )}

          {/* Botão + Principal */}
          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            className={`${showAddMenu ? "bg-[#1C1C1E] text-white rotate-[135deg] border border-white/10" : "bg-[#22C55E] text-black shadow-lg"} h-[64px] w-[64px] rounded-full flex items-center justify-center transition-all duration-300 active:scale-95 relative z-50`}
          >
            <i className={`bi bi-plus-lg text-[32px]`}></i>
          </button>
        </div>

        <button
          onClick={() => navigate("/receitas")}
          className="flex flex-col items-center text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <i className="bi bi-arrow-up text-[24px]"></i>
          <span className="text-[10px] mt-1 font-medium">Receitas</span>
        </button>
        <button
          onClick={() => navigate("/configuracoes")}
          className="flex flex-col items-center text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <i className="bi bi-gear text-[24px]"></i>
          <span className="text-[10px] mt-1 font-medium">Ajustes</span>
        </button>
      </nav>
    </div>
  );
}
