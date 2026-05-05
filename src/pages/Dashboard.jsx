import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import firebase from "firebase/compat/app";
import { auth } from "../firebase/config";
import Sidebar from "../components/Sidebar";
import DashboardCharts from "../components/DashboardCharts";
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
// COMPONENTE: Tooltip
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL: Dashboard
// ─────────────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCalendar, setShowCalendar] = useState(false);

  // Dados brutos
  const [masterTransactions, setMasterTransactions] = useState([]);
  const [categories, setCategories] = useState({});

  // Filtros
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  // Totais
  const [totais, setTotais] = useState({
    receitas: 0,
    despesas: 0,
    sobra: 0,
    rec01: 0,
    rec15: 0,
    desp01: 0,
    desp15: 0,
  });

  // 1. Autenticação e Dados
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      if (currentUser) {
        setUser({
          uid: currentUser.uid,
          name: currentUser.displayName || currentUser.email.split("@")[0],
          email: currentUser.email,
          photoURL: currentUser.photoURL,
          initial: (currentUser.displayName || currentUser.email)
            .charAt(0)
            .toUpperCase(),
        });
      } else {
        navigate("/");
      }
    });
    return () => unsubscribe();
  }, [navigate]);

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
      .catch((error) => {
        console.error("Erro ao buscar dados:", error);
        setIsLoading(false);
      });
  }, [user]);

  // 2. Expansão das transações
  const expandedTransactions = useMemo(() => {
    const mesesParaCalcular =
      currentMonth === "all"
        ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
        : [currentMonth];

    const expanded = [];

    masterTransactions.forEach((master) => {
      mesesParaCalcular.forEach((mes) => {
        const tx = expandMasterForMonth(master, currentYear, mes);
        if (tx) expanded.push(tx);
      });
    });

    return expanded;
  }, [masterTransactions, currentMonth, currentYear]);

  const transactionsForCharts = useMemo(() => {
    return expandedTransactions.map((tx) => ({
      ...tx,
      category: categories[tx.category] || "Outros",
    }));
  }, [expandedTransactions, categories]);

  // 3. Cálculos
  useEffect(() => {
    let rec = 0,
      desp = 0;
    let rec01 = 0,
      rec15 = 0,
      desp01 = 0,
      desp15 = 0;

    expandedTransactions.forEach((t) => {
      const amount = Number(t.amount) || 0;

      if (t.type === "Ganho") {
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
  }, [expandedTransactions]);

  // 4. Funções do Calendário
  const prevMonth = () => {
    if (currentMonth === "all") {
      setCurrentMonth(11);
    } else if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };
  const nextMonth = () => {
    if (currentMonth === "all") {
      setCurrentMonth(0);
    } else if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };
  const goToCurrentMonth = () => {
    setCurrentMonth(new Date().getMonth());
    setCurrentYear(new Date().getFullYear());
  };

  if (!user) return <div className="bg-zinc-900 h-screen"></div>;

  return (
    <div className="bg-zinc-900 text-zinc-200 h-screen grid grid-cols-[auto,1fr] font-['Inter'] overflow-hidden">
      {isLoading && <Loading />}
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Cabeçalho Limpo */}
        <header className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-zinc-900/80 backdrop-blur-sm border-b border-white/10 pl-16 lg:pl-6">
          <div>
            <h1 className="text-2xl font-bold">
              Bem-vindo de volta,{" "}
              <span className="bg-gradient-to-r from-green-400 to-green-600 bg-clip-text text-transparent">
                {user.name}
              </span>
              ! 👋
            </h1>
            <p className="text-zinc-400 text-sm mt-1">
              Seu painel financeiro inteligente
            </p>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 custom-scroll">
          {/* Seletor de Mês/Ano */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-800/80 backdrop-blur-sm p-3 rounded-xl shadow-md mb-8 border border-white/5">
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
                  {currentMonth === "all"
                    ? "Ano Inteiro"
                    : mesesNome[currentMonth]}{" "}
                  {currentYear}
                </span>
                <i
                  className={`bi bi-chevron-down transition-transform duration-200 ${showCalendar ? "rotate-180" : ""}`}
                ></i>
              </button>
              {showCalendar && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-72 bg-zinc-800 border border-white/10 rounded-xl shadow-2xl p-4 z-50 animate-fade-in">
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
                    <button
                      onClick={() => {
                        setCurrentMonth("all");
                        setShowCalendar(false);
                      }}
                      className={`col-span-4 p-2 rounded-lg text-sm transition-all ${currentMonth === "all" ? "bg-green-600 text-white shadow-md" : "bg-zinc-700 hover:bg-zinc-600"}`}
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

          {/* Cards de Resumo */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Receitas */}
            <div className="bg-gradient-to-br from-zinc-800 to-zinc-800/80 rounded-xl shadow-lg p-5 border border-white/5 hover:border-green-500/30 transition-all duration-300 group">
              <div className="flex items-start justify-between mb-3">
                <div className="bg-green-900/30 p-3 rounded-lg group-hover:bg-green-500/20 transition-colors">
                  <i className="bi bi-arrow-up-circle text-xl text-green-400"></i>
                </div>
                <Tooltip text="Total de receitas do período">
                  <i className="bi bi-info-circle text-zinc-500 cursor-help"></i>
                </Tooltip>
              </div>
              <div>
                <h3 className="text-sm text-zinc-300 font-medium">Receitas</h3>
                <p className="text-2xl font-bold text-white mt-1">
                  {formatarMoeda(totais.receitas)}
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-white/10 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-zinc-400">Dia 01</p>
                  <p className="text-sm font-medium text-green-300">
                    {formatarMoeda(totais.rec01)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-400">Dia 15</p>
                  <p className="text-sm font-medium text-green-300">
                    {formatarMoeda(totais.rec15)}
                  </p>
                </div>
              </div>
            </div>

            {/* Despesas */}
            <div className="bg-gradient-to-br from-zinc-800 to-zinc-800/80 rounded-xl shadow-lg p-5 border border-white/5 hover:border-red-500/30 transition-all duration-300 group">
              <div className="flex items-start justify-between mb-3">
                <div className="bg-red-900/30 p-3 rounded-lg group-hover:bg-red-500/20 transition-colors">
                  <i className="bi bi-arrow-down-circle text-xl text-red-400"></i>
                </div>
                <Tooltip text="Total de despesas do período">
                  <i className="bi bi-info-circle text-zinc-500 cursor-help"></i>
                </Tooltip>
              </div>
              <div>
                <h3 className="text-sm text-zinc-300 font-medium">Despesas</h3>
                <p className="text-2xl font-bold text-white mt-1">
                  {formatarMoeda(totais.despesas)}
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-white/10 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-zinc-400">Dia 01</p>
                  <p className="text-sm font-medium text-red-300">
                    {formatarMoeda(totais.desp01)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-400">Dia 15</p>
                  <p className="text-sm font-medium text-red-300">
                    {formatarMoeda(totais.desp15)}
                  </p>
                </div>
              </div>
            </div>

            {/* Sobra */}
            <div className="bg-gradient-to-br from-zinc-800 to-zinc-800/80 rounded-xl shadow-lg p-5 border border-white/5 hover:border-blue-500/30 transition-all duration-300 group">
              <div className="flex items-start justify-between mb-3">
                <div className="bg-blue-900/30 p-3 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                  <i className="bi bi-piggy-bank text-xl text-blue-400"></i>
                </div>
                <Tooltip text="Saldo após despesas (Receitas - Despesas)">
                  <i className="bi bi-info-circle text-zinc-500 cursor-help"></i>
                </Tooltip>
              </div>
              <div>
                <h3 className="text-sm text-zinc-300 font-medium">Sobra</h3>
                <p
                  className={`text-2xl font-bold mt-1 ${totais.sobra >= 0 ? "text-green-400" : "text-red-400"}`}
                >
                  {formatarMoeda(totais.sobra)}
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-white/10 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-zinc-400">Dia 01</p>
                  <p
                    className={`text-sm font-medium ${totais.rec01 - totais.desp01 >= 0 ? "text-green-300" : "text-red-300"}`}
                  >
                    {formatarMoeda(totais.rec01 - totais.desp01)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-400">Dia 15</p>
                  <p
                    className={`text-sm font-medium ${totais.rec15 - totais.desp15 >= 0 ? "text-green-300" : "text-red-300"}`}
                  >
                    {formatarMoeda(totais.rec15 - totais.desp15)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-zinc-800/30 rounded-xl shadow-xl border border-white/5 p-4 md:p-6">
            <DashboardCharts
              transactions={transactionsForCharts}
              currentMonth={currentMonth}
              currentYear={currentYear}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
