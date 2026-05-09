import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom"; // Importado para navegação mobile
import firebase from "firebase/compat/app";
import { auth } from "../firebase/config";
import Sidebar from "../components/Sidebar";
import { formatarMoeda } from "../utils/format";

// Componente de Tooltip reutilizável
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

export default function Metas() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [goals, setGoals] = useState([]);
  const [contributions, setContributions] = useState([]);

  // Estados de Controle de Tela
  const [currentFilter, setCurrentFilter] = useState("all");
  const [view, setView] = useState("list");
  const [selectedGoal, setSelectedGoal] = useState(null);

  // Modais
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    type: "",
    goalId: null,
    contribId: null,
  });

  // Estado do Formulário
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    amount: "",
    currentAmount: "0",
    deadline: "",
    priority: "medium",
    category: "",
    recurring: false,
  });

  const [addValue, setAddValue] = useState("");

  // 1. Carregar Usuário e Metas
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        loadGoals(currentUser.uid);
      } else {
        navigate("/");
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const loadGoals = async (uid) => {
    const db = firebase.firestore();
    const snap = await db
      .collection("users")
      .doc(uid)
      .collection("goals")
      .orderBy("createdAt", "desc")
      .get();
    const loadedGoals = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      amount: Number(doc.data().amount) || 0,
      currentAmount: Number(doc.data().currentAmount) || 0,
    }));
    setGoals(loadedGoals);
  };

  const loadContributions = async (goalId) => {
    const db = firebase.firestore();
    const snap = await db
      .collection("users")
      .doc(user.uid)
      .collection("goals")
      .doc(goalId)
      .collection("contributions")
      .orderBy("date", "desc")
      .get();
    setContributions(
      snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        date: d.data().date?.toDate(),
      })),
    );
  };

  // 2. Processamento
  const filteredGoals = useMemo(() => {
    let filtered = goals;
    if (currentFilter === "active")
      filtered = goals.filter((g) => g.currentAmount < g.amount);
    if (currentFilter === "completed")
      filtered = goals.filter((g) => g.currentAmount >= g.amount);

    return filtered.sort((a, b) => {
      if (a.currentAmount >= a.amount && b.currentAmount < b.amount) return 1;
      if (a.currentAmount < a.amount && b.currentAmount >= b.amount) return -1;
      const pr = { high: 3, medium: 2, low: 1 };
      if (pr[a.priority] > pr[b.priority]) return -1;
      if (pr[a.priority] < pr[b.priority]) return 1;
      return new Date(a.deadline) - new Date(b.deadline);
    });
  }, [goals, currentFilter]);

  const summary = useMemo(() => {
    return {
      total: goals.length,
      completed: goals.filter((g) => g.currentAmount >= g.amount).length,
      saved: goals.reduce((acc, g) => acc + g.currentAmount, 0),
    };
  }, [goals]);

  // 3. Ações no Banco de Dados
  const handleSaveGoal = async (e) => {
    e.preventDefault();
    const db = firebase.firestore();
    const goalsRef = db.collection("users").doc(user.uid).collection("goals");

    const goalData = {
      name: formData.name,
      description: formData.description,
      amount: parseFloat(formData.amount),
      currentAmount: parseFloat(formData.currentAmount) || 0,
      deadline: formData.deadline,
      priority: formData.priority,
      category: formData.category,
      recurring: formData.recurring,
    };

    if (goalData.currentAmount > goalData.amount)
      return alert("Valor atual não pode ser maior que a meta.");

    if (editingGoal) {
      await goalsRef.doc(editingGoal.id).update(goalData);
    } else {
      const newRef = await goalsRef.add({ ...goalData, createdAt: new Date() });
      if (goalData.currentAmount > 0) {
        await newRef.collection("contributions").add({
          value: goalData.currentAmount,
          date: new Date(),
          type: "initial",
        });
      }
    }

    closeForm();
    loadGoals(user.uid);
    if (view === "details" && selectedGoal)
      handleSelectGoal({ ...selectedGoal, ...goalData });
  };

  const handleDelete = async () => {
    const db = firebase.firestore();
    const goalRef = db
      .collection("users")
      .doc(user.uid)
      .collection("goals")
      .doc(deleteModal.goalId);

    if (deleteModal.type === "goal") {
      const contribs = await goalRef.collection("contributions").get();
      const batch = db.batch();
      contribs.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      await goalRef.delete();
      setView("list");
    } else if (deleteModal.type === "contribution") {
      await goalRef
        .collection("contributions")
        .doc(deleteModal.contribId)
        .delete();
      const updatedContribs = await goalRef.collection("contributions").get();
      const newTotal = updatedContribs.docs.reduce(
        (sum, doc) => sum + doc.data().value,
        0,
      );
      await goalRef.update({ currentAmount: newTotal });

      const updatedGoal = { ...selectedGoal, currentAmount: newTotal };
      setSelectedGoal(updatedGoal);
      loadContributions(deleteModal.goalId);
    }

    setDeleteModal({ isOpen: false, type: "", goalId: null, contribId: null });
    loadGoals(user.uid);
  };

  const handleAddContribution = async () => {
    const val = parseFloat(addValue);
    if (isNaN(val) || val <= 0) return alert("Valor inválido.");

    const db = firebase.firestore();
    const goalRef = db
      .collection("users")
      .doc(user.uid)
      .collection("goals")
      .doc(selectedGoal.id);

    await goalRef
      .collection("contributions")
      .add({ value: val, date: new Date(), type: "manual_add" });
    const updatedContribs = await goalRef.collection("contributions").get();
    const newTotal = updatedContribs.docs.reduce(
      (sum, doc) => sum + doc.data().value,
      0,
    );

    await goalRef.update({ currentAmount: newTotal });

    setAddValue("");
    handleSelectGoal({ ...selectedGoal, currentAmount: newTotal });
    loadGoals(user.uid);
  };

  // 4. Funções de Interface
  const openForm = (goal = null) => {
    if (goal) {
      setEditingGoal(goal);
      setFormData({
        name: goal.name,
        description: goal.description || "",
        amount: goal.amount,
        currentAmount: goal.currentAmount,
        deadline: goal.deadline,
        priority: goal.priority,
        category: goal.category || "",
        recurring: goal.recurring || false,
      });
    } else {
      setEditingGoal(null);
      setFormData({
        name: "",
        description: "",
        amount: "",
        currentAmount: "0",
        deadline: "",
        priority: "medium",
        category: "",
        recurring: false,
      });
    }
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingGoal(null);
  };

  const handleSelectGoal = (goal) => {
    setSelectedGoal(goal);
    loadContributions(goal.id);
    setView("details");
  };

  const calculateGoalStats = (g) => {
    const progress = Math.min(
      Math.round((g.currentAmount / g.amount) * 100),
      100,
    );
    const remaining = Math.max(0, g.amount - g.currentAmount);
    const deadline = new Date(g.deadline);
    const today = new Date();

    let monthsLeft = 0;
    if (deadline > today && remaining > 0) {
      monthsLeft =
        (deadline.getFullYear() - today.getFullYear()) * 12 +
        (deadline.getMonth() - today.getMonth());
      if (monthsLeft === 0 && deadline.getDate() >= today.getDate())
        monthsLeft = 1;
    }

    const monthlyRec =
      remaining > 0 ? (monthsLeft > 0 ? remaining / monthsLeft : remaining) : 0;
    const isCompleted = g.currentAmount >= g.amount;

    return {
      progress,
      remaining,
      monthsLeft,
      monthlyRec,
      isCompleted,
      deadlineStr: deadline.toLocaleDateString("pt-BR"),
    };
  };

  if (!user)
    return <div className="bg-[#121212] lg:bg-zinc-900 h-screen"></div>;

  return (
    <div className="bg-[#121212] lg:bg-zinc-900 text-zinc-200 h-screen flex flex-col lg:grid lg:grid-cols-[auto,1fr] font-['Inter'] relative overflow-hidden">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* ─── CABEÇALHO DESKTOP ─── */}
        <header className="hidden lg:flex items-center justify-between px-6 py-4 border-b border-white/10 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <i className="fas fa-bullseye text-[#3B82F6] lg:text-blue-500 text-2xl"></i>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
              Metas Financeiras
            </h1>
          </div>
          {view === "list" && (
            <Tooltip text="Criar nova meta financeira">
              <button
                onClick={() => openForm()}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2 rounded-xl shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 flex items-center gap-2"
              >
                <i className="fas fa-plus"></i>
                <span className="hidden sm:inline">Nova Meta</span>
              </button>
            </Tooltip>
          )}
        </header>

        {/* ─── CABEÇALHO MOBILE (Estilo App Somaí) ─── */}
        <header className="lg:hidden flex flex-col pt-10 px-5 pb-2 bg-[#121212]">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-[26px] font-bold text-white flex items-center gap-2">
              <button
                onClick={() => navigate("/configuracoes")}
                className="text-zinc-500 hover:text-white mr-1 transition-colors"
              >
                <i className="fas fa-arrow-left text-lg"></i>
              </button>
              Metas
            </h1>
          </div>

          {view === "list" && (
            <>
              {/* Card de Resumo Azul (Estilo Flutter) */}
              <div className="bg-gradient-to-br from-[#3B82F6] to-[#1E3A8A] rounded-[24px] p-6 shadow-xl mb-6 border border-white/10 relative overflow-hidden">
                <div className="flex items-center justify-between mb-2 text-white/80">
                  <div className="flex items-center gap-2">
                    <div className="bg-white/20 p-1.5 rounded-lg">
                      <i className="fas fa-piggy-bank text-white text-xs"></i>
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider">
                      Total Poupado
                    </span>
                  </div>
                  <span className="text-xs font-bold bg-white/20 px-2 py-1 rounded-full">
                    {summary.total} Metas
                  </span>
                </div>
                <p className="text-[34px] font-black text-white mb-4">
                  {formatarMoeda(summary.saved)}
                </p>
                <div className="h-[1px] bg-white/20 mb-4" />
                <div className="flex justify-between">
                  <div>
                    <p className="text-[11px] text-white/70 font-medium">
                      Metas Concluídas
                    </p>
                    <p className="text-sm font-bold text-white">
                      <i className="fas fa-check-circle mr-1"></i>{" "}
                      {summary.completed}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-white/70 font-medium">
                      Em Andamento
                    </p>
                    <p className="text-sm font-bold text-white">
                      <i className="fas fa-clock mr-1"></i>{" "}
                      {summary.total - summary.completed}
                    </p>
                  </div>
                </div>
              </div>

              {/* Filtros em Pílulas (Mobile) */}
              <div className="flex gap-2 overflow-x-auto hide-scrollbar mb-4 pb-2">
                {[
                  { id: "all", label: "Todas as Metas", icon: "fa-list" },
                  { id: "active", label: "Em Andamento", icon: "fa-clock" },
                  {
                    id: "completed",
                    label: "Concluídas",
                    icon: "fa-check-double",
                  },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setCurrentFilter(f.id)}
                    className={`whitespace-nowrap px-5 py-2.5 rounded-xl font-bold transition-all duration-200 flex items-center gap-2 text-[13px] ${
                      currentFilter === f.id
                        ? "bg-[#3B82F6] text-white shadow-md"
                        : "bg-[#1C1C1E] text-zinc-400 border border-white/5"
                    }`}
                  >
                    <i className={`fas ${f.icon}`}></i>
                    {f.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 bg-[#121212] lg:bg-zinc-900 custom-scroll pb-[100px] lg:pb-8">
          {/* VISTA 1: LISTA DE METAS */}
          {view === "list" && (
            <div className="animate-fade-in">
              {/* Cartões de Resumo Desktop */}
              <div className="hidden lg:grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
                <div className="bg-gradient-to-br from-zinc-800 to-zinc-800/80 rounded-2xl shadow-lg p-6 border border-white/5 hover:border-blue-500/30 transition-all duration-300 group">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-zinc-300 text-sm">Total de Metas</p>
                      <h3 className="text-3xl font-bold text-white mt-1">
                        {summary.total}
                      </h3>
                    </div>
                    <div className="bg-blue-900/30 text-blue-400 p-3 rounded-xl group-hover:bg-blue-500/20 transition-colors">
                      <i className="fas fa-flag-checkered text-xl"></i>
                    </div>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-zinc-800 to-zinc-800/80 rounded-2xl shadow-lg p-6 border border-white/5 hover:border-blue-500/30 transition-all duration-300 group">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-zinc-300 text-sm">Metas Concluídas</p>
                      <h3 className="text-3xl font-bold text-white mt-1">
                        {summary.completed}
                      </h3>
                    </div>
                    <div className="bg-blue-900/30 text-blue-400 p-3 rounded-xl group-hover:bg-blue-500/20 transition-colors">
                      <i className="fas fa-check-circle text-xl"></i>
                    </div>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-zinc-800 to-zinc-800/80 rounded-2xl shadow-lg p-6 border border-white/5 hover:border-blue-500/30 transition-all duration-300 group">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-zinc-300 text-sm">Total Poupado</p>
                      <h3 className="text-3xl font-bold text-blue-400 mt-1">
                        {formatarMoeda(summary.saved)}
                      </h3>
                    </div>
                    <div className="bg-blue-900/30 text-blue-400 p-3 rounded-xl group-hover:bg-blue-500/20 transition-colors">
                      <i className="fas fa-piggy-bank text-xl"></i>
                    </div>
                  </div>
                </div>
              </div>

              {/* Filtros Desktop */}
              <div className="hidden lg:flex flex-wrap gap-3 mb-6">
                {[
                  { id: "all", label: "Todas", icon: "fa-list" },
                  { id: "active", label: "Em Andamento", icon: "fa-clock" },
                  {
                    id: "completed",
                    label: "Concluídas",
                    icon: "fa-check-double",
                  },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setCurrentFilter(f.id)}
                    className={`px-5 py-2 rounded-xl font-medium transition-all duration-200 flex items-center gap-2 ${currentFilter === f.id ? "bg-blue-600 text-white shadow-md scale-105" : "bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700/80 border border-white/5"}`}
                  >
                    <i className={`fas ${f.icon}`}></i>
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Grid de Metas */}
              {filteredGoals.length === 0 ? (
                <div className="text-center py-16 bg-[#1C1C1E] lg:bg-zinc-800/30 rounded-[24px] lg:rounded-2xl border border-white/5 backdrop-blur-sm">
                  <i className="fas fa-bullseye text-5xl text-zinc-600 mb-4 block"></i>
                  <p className="text-zinc-400 text-lg font-medium mb-4">
                    Nenhuma meta encontrada.
                  </p>
                  <button
                    onClick={() => openForm()}
                    className="px-6 py-3 bg-[#3B82F6] hover:bg-blue-600 rounded-xl text-white font-bold shadow-md transition-colors"
                  >
                    Criar primeira meta
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
                  {filteredGoals.map((g) => {
                    const stats = calculateGoalStats(g);
                    return (
                      <div
                        key={g.id}
                        onClick={() => handleSelectGoal(g)}
                        className={`bg-[#1C1C1E] lg:bg-zinc-800/80 rounded-[24px] lg:rounded-2xl shadow-sm lg:shadow-lg p-5 lg:p-6 border border-white/5 cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-[#3B82F6]/30 ${stats.isCompleted ? "opacity-80" : ""}`}
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1 pr-3">
                            <h3 className="font-bold text-[17px] text-white truncate">
                              {g.name}
                            </h3>
                            {g.category && (
                              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                                {g.category}
                              </span>
                            )}
                          </div>
                          <span
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide shadow-sm ${g.priority === "high" ? "bg-red-500/10 text-red-500" : g.priority === "medium" ? "bg-yellow-500/10 text-yellow-500" : "bg-blue-500/10 text-blue-500"}`}
                          >
                            {g.priority === "high"
                              ? "Alta"
                              : g.priority === "medium"
                                ? "Média"
                                : "Baixa"}
                          </span>
                        </div>

                        {g.description && (
                          <p className="text-sm text-zinc-400 mb-5 line-clamp-2 leading-relaxed">
                            {g.description}
                          </p>
                        )}

                        <div className="mb-5">
                          <div className="flex justify-between text-[13px] text-zinc-300 mb-2 font-bold">
                            <span>Progresso</span>
                            <span className="text-[#3B82F6]">
                              {stats.progress}%
                            </span>
                          </div>
                          <div className="w-full bg-[#121212] lg:bg-zinc-900 rounded-full h-2.5 overflow-hidden border border-white/5">
                            <div
                              className={`h-full transition-all duration-700 rounded-full shadow-[0_0_6px_rgba(59,130,246,0.5)] ${stats.isCompleted ? "bg-[#22C55E]" : "bg-gradient-to-r from-blue-500 to-blue-400"}`}
                              style={{ width: `${stats.progress}%` }}
                            ></div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-y-4 gap-x-3 text-sm bg-[#121212] lg:bg-black/20 p-4 rounded-xl border border-white/5">
                          <div>
                            <p className="text-zinc-500 text-[11px] font-bold uppercase tracking-wide">
                              Objetivo
                            </p>
                            <p className="font-bold text-white mt-0.5">
                              {formatarMoeda(g.amount)}
                            </p>
                          </div>
                          <div>
                            <p className="text-zinc-500 text-[11px] font-bold uppercase tracking-wide">
                              Atual
                            </p>
                            <p
                              className={`font-bold mt-0.5 ${stats.isCompleted ? "text-[#22C55E]" : "text-[#3B82F6]"}`}
                            >
                              {formatarMoeda(g.currentAmount)}
                            </p>
                          </div>
                          <div>
                            <p className="text-zinc-500 text-[11px] font-bold uppercase tracking-wide">
                              Prazo
                            </p>
                            <p className="font-bold text-white mt-0.5">
                              {stats.deadlineStr}
                            </p>
                          </div>
                          <div>
                            <p className="text-zinc-500 text-[11px] font-bold uppercase tracking-wide">
                              Sugestão Mensal
                            </p>
                            <p
                              className={`font-bold mt-0.5 ${stats.isCompleted ? "text-[#22C55E]" : "text-yellow-500"}`}
                            >
                              {stats.isCompleted
                                ? "Concluído"
                                : formatarMoeda(stats.monthlyRec)}
                            </p>
                          </div>
                        </div>

                        {stats.isCompleted && (
                          <div className="mt-4 text-center bg-[#22C55E]/10 text-[#22C55E] py-2.5 rounded-xl text-sm font-bold uppercase tracking-wide">
                            <i className="fas fa-check-circle mr-2"></i>Meta
                            Atingida!
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* VISTA 2: DETALHES DA META */}
          {view === "details" &&
            selectedGoal &&
            (() => {
              const stats = calculateGoalStats(selectedGoal);
              const radius = 45;
              const circumference = 2 * Math.PI * radius;
              const offset =
                circumference - (stats.progress / 100) * circumference;

              return (
                <div className="animate-fade-in">
                  <div className="flex flex-wrap items-center gap-4 mb-6 lg:mb-8">
                    <Tooltip text="Voltar para lista">
                      <button
                        onClick={() => setView("list")}
                        className="px-4 py-2 bg-[#1C1C1E] lg:bg-zinc-800 border border-white/5 rounded-xl hover:bg-zinc-700 transition-colors flex items-center gap-2 font-bold"
                      >
                        <i className="fas fa-arrow-left"></i>{" "}
                        <span className="hidden sm:inline">Voltar</span>
                      </button>
                    </Tooltip>
                    <div>
                      <h2 className="text-2xl font-bold text-white">
                        {selectedGoal.name}
                      </h2>
                      <p className="text-zinc-400 text-sm font-medium">
                        {stats.remaining > 0
                          ? `Faltam ${formatarMoeda(stats.remaining)} para concluir`
                          : "Meta concluída com sucesso! 🎉"}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
                    {/* Coluna da Esquerda */}
                    <div className="lg:col-span-1 space-y-6">
                      {/* Círculo de Progresso */}
                      <div className="bg-[#1C1C1E] lg:bg-zinc-800/80 rounded-[24px] lg:rounded-2xl shadow-lg p-8 border border-white/5 text-center">
                        <h3 className="text-lg font-bold text-white mb-6">
                          Progresso Atual
                        </h3>
                        <div className="relative w-48 h-48 mx-auto">
                          <svg
                            className="w-full h-full transform -rotate-90"
                            viewBox="0 0 100 100"
                          >
                            <circle
                              className="text-zinc-700/50"
                              strokeWidth="8"
                              stroke="currentColor"
                              fill="transparent"
                              r={radius}
                              cx="50"
                              cy="50"
                            />
                            <circle
                              className={`${stats.isCompleted ? "text-[#22C55E]" : "text-[#3B82F6]"} transition-all duration-1000 ease-out`}
                              strokeWidth="8"
                              strokeLinecap="round"
                              stroke="currentColor"
                              fill="transparent"
                              r={radius}
                              cx="50"
                              cy="50"
                              style={{
                                strokeDasharray: circumference,
                                strokeDashoffset: offset,
                              }}
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center flex-col">
                            <span className="text-4xl font-black text-white tracking-tighter">
                              {stats.progress}%
                            </span>
                            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">
                              Concluído
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Resumo Financeiro */}
                      <div className="bg-[#1C1C1E] lg:bg-zinc-800/80 rounded-[24px] lg:rounded-2xl shadow-lg p-6 lg:p-8 border border-white/5 space-y-5">
                        <div className="flex justify-between items-center border-b border-white/5 pb-4">
                          <p className="text-zinc-400 font-medium">
                            Valor Total
                          </p>
                          <p className="font-bold text-white text-base">
                            {formatarMoeda(selectedGoal.amount)}
                          </p>
                        </div>
                        <div className="flex justify-between items-center border-b border-white/5 pb-4">
                          <p className="text-zinc-400 font-medium">
                            Poupado Atual
                          </p>
                          <p
                            className={`font-bold text-base ${stats.isCompleted ? "text-[#22C55E]" : "text-[#3B82F6]"}`}
                          >
                            {formatarMoeda(selectedGoal.currentAmount)}
                          </p>
                        </div>
                        <div className="flex justify-between items-center border-b border-white/5 pb-4">
                          <p className="text-zinc-400 font-medium">
                            Tempo Restante
                          </p>
                          <p className="font-bold text-white bg-[#121212] lg:bg-black/30 px-3 py-1 rounded-lg border border-white/5">
                            {stats.monthsLeft} meses
                          </p>
                        </div>
                        <div className="flex justify-between items-center pt-1">
                          <p className="text-zinc-400 font-medium">
                            Sugestão Mensal
                          </p>
                          <p className="font-bold text-yellow-500 text-base">
                            {formatarMoeda(stats.monthlyRec)}
                          </p>
                        </div>
                      </div>

                      {/* Adicionar Contribuição */}
                      {!stats.isCompleted && (
                        <div className="bg-[#1C1C1E] lg:bg-zinc-800/80 rounded-[24px] lg:rounded-2xl shadow-lg p-6 lg:p-8 border border-white/5">
                          <label className="block text-sm font-bold text-zinc-300 mb-4 uppercase tracking-wide">
                            Adicionar Depósito
                          </label>
                          <div className="flex flex-col sm:flex-row gap-3">
                            <div className="relative flex-1">
                              <span className="absolute left-4 top-3.5 text-zinc-500 font-bold">
                                R$
                              </span>
                              <input
                                type="number"
                                value={addValue}
                                onChange={(e) => setAddValue(e.target.value)}
                                className="w-full pl-11 pr-4 py-3.5 border border-white/5 lg:border-zinc-600 bg-[#121212] lg:bg-zinc-900 text-white rounded-xl focus:ring-1 focus:ring-[#3B82F6] transition-all outline-none font-medium"
                                placeholder="0,00"
                                min="0"
                                step="0.01"
                              />
                            </div>
                            <button
                              onClick={handleAddContribution}
                              className="bg-[#3B82F6] hover:bg-blue-600 text-white px-6 py-3.5 rounded-xl font-bold transition-all shadow-md active:scale-95"
                            >
                              Somar
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Ações da Meta */}
                      <div className="flex space-x-3 pt-2">
                        <button
                          onClick={() => openForm(selectedGoal)}
                          className="flex-1 px-4 py-3.5 bg-[#121212] lg:bg-transparent border border-white/5 lg:border-zinc-600 rounded-xl text-white hover:bg-zinc-800 font-bold transition-colors shadow-sm"
                        >
                          <i className="fas fa-pen mr-2 text-zinc-400"></i>
                          Editar
                        </button>
                        <button
                          onClick={() =>
                            setDeleteModal({
                              isOpen: true,
                              type: "goal",
                              goalId: selectedGoal.id,
                            })
                          }
                          className="flex-1 px-4 py-3.5 bg-[#EF4444]/10 border border-[#EF4444]/20 text-[#EF4444] hover:bg-[#EF4444] hover:text-white rounded-xl font-bold transition-colors shadow-sm"
                        >
                          <i className="fas fa-trash mr-2"></i>Excluir
                        </button>
                      </div>
                    </div>

                    {/* Coluna da Direita - Histórico */}
                    <div className="lg:col-span-2">
                      <div className="bg-[#1C1C1E] lg:bg-zinc-800/80 rounded-[24px] lg:rounded-2xl shadow-lg border border-white/5 h-full flex flex-col">
                        <div className="p-6 lg:p-8 border-b border-white/5">
                          <h3 className="text-lg font-bold text-white">
                            <i className="fas fa-history mr-2 text-[#3B82F6]"></i>
                            Histórico de Depósitos
                          </h3>
                        </div>
                        <div className="flex-1 overflow-x-auto custom-scroll p-2 lg:p-4">
                          <table className="min-w-full text-left text-sm">
                            <thead className="text-zinc-500 font-bold uppercase tracking-wider text-[11px]">
                              <tr>
                                <th className="pb-4 px-6 border-b border-white/5">
                                  Data
                                </th>
                                <th className="pb-4 px-6 border-b border-white/5">
                                  Motivo
                                </th>
                                <th className="pb-4 px-6 border-b border-white/5 text-right">
                                  Valor depositado
                                </th>
                                <th className="pb-4 px-6 border-b border-white/5 text-center">
                                  Excluir
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                              {contributions.length === 0 ? (
                                <tr>
                                  <td
                                    colSpan="4"
                                    className="text-center py-16 text-zinc-500"
                                  >
                                    <i className="fas fa-coins text-4xl mb-3 block opacity-50"></i>
                                    <span className="font-medium">
                                      Nenhum depósito registrado ainda.
                                    </span>
                                  </td>
                                </tr>
                              ) : (
                                contributions.map((c) => (
                                  <tr
                                    key={c.id}
                                    className="hover:bg-white/5 transition-colors"
                                  >
                                    <td className="py-4 px-6 text-zinc-300 font-medium">
                                      {c.date?.toLocaleDateString("pt-BR")}
                                    </td>
                                    <td className="py-4 px-6 text-zinc-400">
                                      {c.type === "initial"
                                        ? "Depósito Inicial"
                                        : "Depósito Manual"}
                                    </td>
                                    <td className="py-4 px-6 font-black text-[#22C55E] text-right">
                                      +{formatarMoeda(c.value)}
                                    </td>
                                    <td className="py-4 px-6 text-center">
                                      <button
                                        onClick={() =>
                                          setDeleteModal({
                                            isOpen: true,
                                            type: "contribution",
                                            goalId: selectedGoal.id,
                                            contribId: c.id,
                                          })
                                        }
                                        className="text-zinc-500 hover:text-[#EF4444] bg-[#121212] lg:bg-transparent p-2.5 rounded-lg transition-colors"
                                      >
                                        <i className="fas fa-trash-alt"></i>
                                      </button>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
        </main>
      </div>

      {/* ─── BOTTOM NAVIGATION MOBILE (Nativo) ─── */}
      <nav className="lg:hidden fixed bottom-0 w-full bg-[#1A1A1A] px-6 py-2 pb-4 flex justify-between items-center z-50 rounded-t-[32px] shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.8)] border-t border-white/5">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex flex-col items-center text-zinc-500"
        >
          <i className="bi bi-house-door-fill text-[24px]"></i>
          <span className="text-[10px] mt-1 font-medium">Início</span>
        </button>
        <button
          onClick={() => navigate("/despesas")}
          className="flex flex-col items-center text-zinc-500"
        >
          <i className="bi bi-arrow-down-circle text-[24px]"></i>
          <span className="text-[10px] mt-1 font-medium">Despesas</span>
        </button>

        {/* FAB Central */}
        <div className="relative -top-7">
          <button
            onClick={() => {
              if (view === "details") setView("list");
              openForm();
            }}
            className="bg-[#3B82F6] text-white h-[64px] w-[64px] rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform"
          >
            <i className="bi bi-plus-lg text-[32px]"></i>
          </button>
        </div>

        <button
          onClick={() => navigate("/receitas")}
          className="flex flex-col items-center text-zinc-500"
        >
          <i className="bi bi-arrow-up-circle-fill text-[24px]"></i>
          <span className="text-[10px] mt-1 font-medium">Receitas</span>
        </button>
        <button
          onClick={() => navigate("/configuracoes")}
          className="flex flex-col items-center text-[#3B82F6] font-bold"
        >
          <i className="bi bi-gear-fill text-[24px]"></i>
          <span className="text-[10px] mt-1">Ajustes</span>
        </button>
      </nav>

      {/* Modal Lateral (Formulário) */}
      {isFormOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
          onClick={closeForm}
        ></div>
      )}
      <div
        className={`fixed right-0 top-0 h-full w-full max-w-md bg-[#121212] lg:bg-zinc-900 border-l border-white/5 shadow-2xl z-[110] overflow-y-auto custom-scroll transition-transform duration-300 ${isFormOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="p-6 lg:p-8">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <i
                className={`fas ${editingGoal ? "fa-pen" : "fa-bullseye"} text-[#3B82F6]`}
              ></i>
              {editingGoal ? "Editar Meta" : "Nova Meta"}
            </h3>
            <button
              onClick={closeForm}
              className="bg-[#1C1C1E] lg:bg-zinc-800 w-10 h-10 rounded-full flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>

          <form onSubmit={handleSaveGoal} className="space-y-6">
            <div>
              <label className="block text-[13px] font-bold text-zinc-400 uppercase tracking-wide mb-2">
                Nome da Meta *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="w-full px-4 py-3.5 lg:py-3 bg-[#1C1C1E] lg:bg-zinc-800 border border-white/5 lg:border-zinc-700 rounded-xl text-white focus:ring-1 focus:ring-[#3B82F6] outline-none transition-all"
                placeholder="Ex: Comprar um carro"
                required
              />
            </div>

            <div>
              <label className="block text-[13px] font-bold text-zinc-400 uppercase tracking-wide mb-2">
                Descrição
              </label>
              <textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                rows="2"
                className="w-full px-4 py-3.5 lg:py-3 bg-[#1C1C1E] lg:bg-zinc-800 border border-white/5 lg:border-zinc-700 rounded-xl text-white focus:ring-1 focus:ring-[#3B82F6] resize-none outline-none transition-all"
                placeholder="Detalhes adicionais (Opcional)"
              ></textarea>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[13px] font-bold text-zinc-400 uppercase tracking-wide mb-2">
                  Alvo (R$) *
                </label>
                <input
                  type="number"
                  value={formData.amount}
                  onChange={(e) =>
                    setFormData({ ...formData, amount: e.target.value })
                  }
                  className="w-full px-4 py-3.5 lg:py-3 bg-[#1C1C1E] lg:bg-zinc-800 border border-white/5 lg:border-zinc-700 rounded-xl text-white focus:ring-1 focus:ring-[#3B82F6] outline-none"
                  min="0"
                  step="0.01"
                  required
                />
              </div>
              <div>
                <label className="block text-[13px] font-bold text-zinc-400 uppercase tracking-wide mb-2">
                  Já tenho (R$)
                </label>
                <input
                  type="number"
                  value={formData.currentAmount}
                  onChange={(e) =>
                    setFormData({ ...formData, currentAmount: e.target.value })
                  }
                  className="w-full px-4 py-3.5 lg:py-3 bg-[#1C1C1E] lg:bg-zinc-800 border border-white/5 lg:border-zinc-700 rounded-xl text-white focus:ring-1 focus:ring-[#3B82F6] outline-none disabled:opacity-50"
                  min="0"
                  step="0.01"
                  disabled={editingGoal !== null}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[13px] font-bold text-zinc-400 uppercase tracking-wide mb-2">
                  Data Limite *
                </label>
                <input
                  type="date"
                  value={formData.deadline}
                  onChange={(e) =>
                    setFormData({ ...formData, deadline: e.target.value })
                  }
                  className="w-full px-4 py-3.5 lg:py-3 bg-[#1C1C1E] lg:bg-zinc-800 border border-white/5 lg:border-zinc-700 rounded-xl text-white focus:ring-1 focus:ring-[#3B82F6] outline-none [color-scheme:dark]"
                  required
                />
              </div>
              <div>
                <label className="block text-[13px] font-bold text-zinc-400 uppercase tracking-wide mb-2">
                  Prioridade
                </label>
                <select
                  value={formData.priority}
                  onChange={(e) =>
                    setFormData({ ...formData, priority: e.target.value })
                  }
                  className="w-full px-4 py-3.5 lg:py-3 bg-[#1C1C1E] lg:bg-zinc-800 border border-white/5 lg:border-zinc-700 rounded-xl text-white focus:ring-1 focus:ring-[#3B82F6] outline-none"
                >
                  <option value="low">Baixa</option>
                  <option value="medium">Média</option>
                  <option value="high">Alta</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-bold text-zinc-400 uppercase tracking-wide mb-2">
                Categoria
              </label>
              <select
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
                className="w-full px-4 py-3.5 lg:py-3 bg-[#1C1C1E] lg:bg-zinc-800 border border-white/5 lg:border-zinc-700 rounded-xl text-white focus:ring-1 focus:ring-[#3B82F6] outline-none"
              >
                <option value="">Selecione...</option>
                <option value="viagem">Viagem</option>
                <option value="veiculo">Veículo</option>
                <option value="casa">Casa</option>
                <option value="educacao">Educação</option>
                <option value="saude">Saúde</option>
                <option value="lazer">Lazer</option>
                <option value="outros">Outros</option>
              </select>
            </div>

            <div className="pt-6 flex flex-col-reverse sm:flex-row gap-3 border-t border-white/5">
              <button
                type="button"
                onClick={closeForm}
                className="w-full py-3.5 lg:py-3 bg-[#1C1C1E] lg:bg-zinc-800 border border-white/5 text-zinc-300 rounded-xl hover:bg-zinc-700 font-bold transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="w-full py-3.5 lg:py-3 bg-[#3B82F6] text-white rounded-xl hover:bg-blue-600 font-bold shadow-md transition-all active:scale-95"
              >
                {editingGoal ? "Salvar Edição" : "Criar Meta"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Modal de Exclusão */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[120] p-5">
          <div className="bg-[#1C1C1E] lg:bg-zinc-900 border border-white/10 rounded-[28px] shadow-2xl w-full max-w-sm p-6 lg:p-8 animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-[#EF4444]/10 p-2.5 rounded-xl">
                <i className="fas fa-exclamation-triangle text-[#EF4444] text-xl"></i>
              </div>
              <h3 className="text-xl font-bold text-white">
                {deleteModal.type === "goal"
                  ? "Excluir Meta?"
                  : "Excluir Depósito?"}
              </h3>
            </div>
            <p className="text-zinc-400 text-sm mb-8 leading-relaxed">
              {deleteModal.type === "goal"
                ? "Todas as contribuições atreladas a ela também serão removidas. Essa ação não pode ser desfeita."
                : "Este depósito será removido e o valor subtraído do progresso da sua meta."}
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={handleDelete}
                className="w-full py-3.5 rounded-xl font-bold text-white bg-[#EF4444] hover:bg-red-600 transition-colors shadow-md uppercase tracking-wide text-xs"
              >
                Sim, Excluir
              </button>
              <button
                onClick={() =>
                  setDeleteModal({
                    isOpen: false,
                    type: "",
                    goalId: null,
                    contribId: null,
                  })
                }
                className="w-full py-3.5 rounded-xl font-bold text-zinc-400 bg-[#121212] border border-white/5 hover:bg-zinc-800 transition-colors uppercase tracking-wide text-xs"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
