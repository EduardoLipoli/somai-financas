import React, { useEffect, useState, useMemo } from "react";
import firebase from "firebase/compat/app";
import { auth } from "../firebase/config";
import Sidebar from "../components/Sidebar";
import { formatarMoeda } from "../utils/format";

// Componente de Tooltip reutilizável (mesmo padrão)
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
      }
    });
    return () => unsubscribe();
  }, []);

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
        await newRef
          .collection("contributions")
          .add({
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

  if (!user) return <div className="bg-zinc-900 h-screen"></div>;

  return (
    <div className="bg-zinc-900 text-zinc-200 h-screen grid grid-cols-[auto,1fr] font-['Inter'] overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Cabeçalho com gradiente e ícone */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <i className="fas fa-bullseye text-green-500 text-2xl"></i>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-green-400 to-green-600 bg-clip-text text-transparent">
              Metas Financeiras
            </h1>
          </div>
          {view === "list" && (
            <Tooltip text="Criar nova meta financeira">
              <button
                onClick={() => openForm()}
                className="bg-green-500 hover:bg-green-600 text-white font-bold px-5 py-2 rounded-xl shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 flex items-center gap-2"
              >
                <i className="fas fa-plus"></i>
                <span className="hidden sm:inline">Nova Meta</span>
              </button>
            </Tooltip>
          )}
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 custom-scroll">
          {/* VISTA 1: LISTA DE METAS */}
          {view === "list" && (
            <div className="animate-fade-in">
              {/* Cartões de Resumo com gradiente e hover */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
                <div className="bg-gradient-to-br from-zinc-800 to-zinc-800/80 rounded-xl shadow-lg p-6 border border-white/5 hover:border-green-500/30 transition-all duration-300 group">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-zinc-300 text-sm">Total de Metas</p>
                      <h3 className="text-3xl font-bold text-white mt-1">
                        {summary.total}
                      </h3>
                    </div>
                    <div className="bg-green-900/30 text-green-500 p-3 rounded-lg group-hover:bg-green-500/20 transition-colors">
                      <i className="fas fa-flag-checkered text-xl"></i>
                    </div>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-zinc-800 to-zinc-800/80 rounded-xl shadow-lg p-6 border border-white/5 hover:border-green-500/30 transition-all duration-300 group">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-zinc-300 text-sm">Metas Concluídas</p>
                      <h3 className="text-3xl font-bold text-white mt-1">
                        {summary.completed}
                      </h3>
                    </div>
                    <div className="bg-green-900/30 text-green-500 p-3 rounded-lg group-hover:bg-green-500/20 transition-colors">
                      <i className="fas fa-check-circle text-xl"></i>
                    </div>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-zinc-800 to-zinc-800/80 rounded-xl shadow-lg p-6 border border-white/5 hover:border-green-500/30 transition-all duration-300 group">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-zinc-300 text-sm">Total Poupado</p>
                      <h3 className="text-3xl font-bold text-green-400 mt-1">
                        {formatarMoeda(summary.saved)}
                      </h3>
                    </div>
                    <div className="bg-green-900/30 text-green-500 p-3 rounded-lg group-hover:bg-green-500/20 transition-colors">
                      <i className="fas fa-piggy-bank text-xl"></i>
                    </div>
                  </div>
                </div>
              </div>

              {/* Filtros estilizados */}
              <div className="flex flex-wrap gap-3 mb-6">
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
                    className={`px-5 py-2 rounded-xl font-medium transition-all duration-200 flex items-center gap-2 ${currentFilter === f.id ? "bg-green-600 text-white shadow-md scale-105" : "bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700/80 border border-white/5"}`}
                  >
                    <i className={`fas ${f.icon}`}></i>
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Grid de Metas */}
              {filteredGoals.length === 0 ? (
                <div className="text-center py-16 bg-zinc-800/30 rounded-xl border border-white/5 backdrop-blur-sm">
                  <i className="fas fa-inbox text-5xl text-zinc-600 mb-4"></i>
                  <p className="text-zinc-400 text-lg">
                    Nenhuma meta encontrada.
                  </p>
                  <button
                    onClick={() => openForm()}
                    className="mt-4 px-5 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-white transition-colors"
                  >
                    Criar primeira meta
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredGoals.map((g) => {
                    const stats = calculateGoalStats(g);
                    return (
                      <div
                        key={g.id}
                        onClick={() => handleSelectGoal(g)}
                        className={`bg-zinc-800/80 rounded-xl shadow-lg p-5 border border-white/5 cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:border-green-500/30 ${stats.isCompleted ? "opacity-80" : ""}`}
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1 pr-3">
                            <h3 className="font-bold text-lg truncate">
                              {g.name}
                            </h3>
                            {g.category && (
                              <span className="text-xs text-zinc-400 uppercase tracking-wider">
                                {g.category}
                              </span>
                            )}
                          </div>
                          <span
                            className={`px-2 py-1 rounded-md text-xs font-semibold shadow-sm ${g.priority === "high" ? "bg-red-900/40 text-red-400" : g.priority === "medium" ? "bg-yellow-900/40 text-yellow-400" : "bg-blue-900/40 text-blue-400"}`}
                          >
                            {g.priority === "high"
                              ? "Alta"
                              : g.priority === "medium"
                                ? "Média"
                                : "Baixa"}
                          </span>
                        </div>
                        {g.description && (
                          <p className="text-sm text-zinc-400 mb-4 line-clamp-2">
                            {g.description}
                          </p>
                        )}

                        <div className="mb-5">
                          <div className="flex justify-between text-sm text-zinc-300 mb-2 font-medium">
                            <span>Progresso</span>
                            <span>{stats.progress}%</span>
                          </div>
                          <div className="w-full bg-zinc-900 rounded-full h-2.5 overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-green-500 to-green-400 h-full transition-all duration-700 rounded-full shadow-[0_0_6px_rgba(34,197,94,0.5)]"
                              style={{ width: `${stats.progress}%` }}
                            ></div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-sm bg-black/20 p-3 rounded-lg border border-white/5">
                          <div>
                            <p className="text-zinc-400 text-xs">Objetivo</p>
                            <p className="font-medium text-white">
                              {formatarMoeda(g.amount)}
                            </p>
                          </div>
                          <div>
                            <p className="text-zinc-400 text-xs">Atual</p>
                            <p
                              className={`font-bold ${stats.isCompleted ? "text-green-500" : "text-white"}`}
                            >
                              {formatarMoeda(g.currentAmount)}
                            </p>
                          </div>
                          <div>
                            <p className="text-zinc-400 text-xs">Prazo</p>
                            <p className="font-medium text-white">
                              {stats.deadlineStr}
                            </p>
                          </div>
                          <div>
                            <p className="text-zinc-400 text-xs">
                              Sugestão mensal
                            </p>
                            <p
                              className={`font-bold ${stats.isCompleted ? "text-green-500" : "text-yellow-400"}`}
                            >
                              {stats.isCompleted
                                ? "Concluído"
                                : formatarMoeda(stats.monthlyRec)}
                            </p>
                          </div>
                        </div>

                        {stats.isCompleted && (
                          <div className="mt-4 text-center bg-green-500/20 text-green-400 py-2 rounded-lg text-sm font-bold">
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

          {/* VISTA 2: DETALHES DA META (com design aprimorado) */}
          {view === "details" &&
            selectedGoal &&
            (() => {
              const stats = calculateGoalStats(selectedGoal);
              const radius = 40;
              const circumference = 2 * Math.PI * radius;
              const offset =
                circumference - (stats.progress / 100) * circumference;

              return (
                <div className="animate-fade-in">
                  <div className="flex flex-wrap items-center gap-4 mb-6">
                    <Tooltip text="Voltar para lista">
                      <button
                        onClick={() => setView("list")}
                        className="px-4 py-2 bg-zinc-800 border border-white/10 rounded-xl hover:bg-zinc-700 transition-colors flex items-center gap-2"
                      >
                        <i className="fas fa-arrow-left"></i>{" "}
                        <span>Voltar</span>
                      </button>
                    </Tooltip>
                    <div>
                      <h2 className="text-2xl font-bold text-white">
                        {selectedGoal.name}
                      </h2>
                      <p className="text-zinc-400 text-sm">
                        {stats.remaining > 0
                          ? `Faltam ${formatarMoeda(stats.remaining)} para concluir`
                          : "Meta concluída com sucesso!"}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Coluna da Esquerda */}
                    <div className="lg:col-span-1 space-y-6">
                      {/* Círculo de Progresso */}
                      <div className="bg-zinc-800/80 rounded-xl shadow-lg p-6 border border-white/5 text-center">
                        <h3 className="text-lg font-bold text-white mb-4">
                          Progresso Atual
                        </h3>
                        <div className="relative w-40 h-40 mx-auto">
                          <svg className="w-full h-full" viewBox="0 0 100 100">
                            <circle
                              className="text-zinc-700"
                              strokeWidth="8"
                              stroke="currentColor"
                              fill="transparent"
                              r={radius}
                              cx="50"
                              cy="50"
                            />
                            <circle
                              className="text-green-500 transition-all duration-700"
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
                            <span className="text-3xl font-bold text-white">
                              {stats.progress}%
                            </span>
                            <span className="text-xs text-zinc-400 uppercase tracking-widest mt-1">
                              Concluído
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Resumo Financeiro */}
                      <div className="bg-zinc-800/80 rounded-xl shadow-lg p-6 border border-white/5 space-y-4 text-sm">
                        <div className="flex justify-between items-center border-b border-white/10 pb-3">
                          <p className="text-zinc-400">Valor Total</p>
                          <p className="font-bold text-white text-base">
                            {formatarMoeda(selectedGoal.amount)}
                          </p>
                        </div>
                        <div className="flex justify-between items-center border-b border-white/10 pb-3">
                          <p className="text-zinc-400">Poupado Atual</p>
                          <p className="font-bold text-green-400 text-base">
                            {formatarMoeda(selectedGoal.currentAmount)}
                          </p>
                        </div>
                        <div className="flex justify-between items-center border-b border-white/10 pb-3">
                          <p className="text-zinc-400">Tempo Restante</p>
                          <p className="font-medium text-white bg-black/30 px-3 py-1 rounded-full">
                            {stats.monthsLeft} meses
                          </p>
                        </div>
                        <div className="flex justify-between items-center pt-1">
                          <p className="text-zinc-400">Sugestão Mensal</p>
                          <p className="font-bold text-yellow-400 text-base">
                            {formatarMoeda(stats.monthlyRec)}
                          </p>
                        </div>
                      </div>

                      {/* Adicionar Contribuição */}
                      {!stats.isCompleted && (
                        <div className="bg-zinc-800/80 rounded-xl shadow-lg p-6 border border-white/5">
                          <label className="block text-sm font-medium text-zinc-300 mb-3">
                            Adicionar depósito
                          </label>
                          <div className="flex space-x-2">
                            <div className="relative flex-1">
                              <span className="absolute left-3 top-2.5 text-zinc-400 font-medium">
                                R$
                              </span>
                              <input
                                type="number"
                                value={addValue}
                                onChange={(e) => setAddValue(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 border border-zinc-600 bg-zinc-900 text-white rounded-lg focus:ring-2 focus:ring-green-500 transition-all"
                                placeholder="0,00"
                                min="0"
                                step="0.01"
                              />
                            </div>
                            <Tooltip text="Adicionar valor à meta">
                              <button
                                onClick={handleAddContribution}
                                className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg font-medium transition-colors shadow-md"
                              >
                                Somar
                              </button>
                            </Tooltip>
                          </div>
                        </div>
                      )}

                      {/* Ações da Meta */}
                      <div className="flex space-x-3 pt-2">
                        <Tooltip text="Editar meta">
                          <button
                            onClick={() => openForm(selectedGoal)}
                            className="flex-1 px-4 py-3 border border-zinc-600 rounded-xl text-white hover:bg-zinc-800 font-medium transition-colors"
                          >
                            <i className="fas fa-pen mr-2"></i>Editar
                          </button>
                        </Tooltip>
                        <Tooltip text="Excluir meta permanentemente">
                          <button
                            onClick={() =>
                              setDeleteModal({
                                isOpen: true,
                                type: "goal",
                                goalId: selectedGoal.id,
                              })
                            }
                            className="flex-1 px-4 py-3 bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white rounded-xl font-medium transition-colors"
                          >
                            <i className="fas fa-trash mr-2"></i>Excluir
                          </button>
                        </Tooltip>
                      </div>
                    </div>

                    {/* Coluna da Direita - Histórico */}
                    <div className="lg:col-span-2">
                      <div className="bg-zinc-800/80 rounded-xl shadow-lg border border-white/5 h-full flex flex-col">
                        <div className="p-6 border-b border-white/10">
                          <h3 className="text-lg font-bold text-white">
                            <i className="fas fa-history mr-2 text-zinc-400"></i>
                            Histórico de Depósitos
                          </h3>
                        </div>
                        <div className="flex-1 overflow-auto p-4 custom-scroll">
                          <table className="w-full text-left text-sm">
                            <thead className="text-zinc-400 border-b border-white/10">
                              <tr>
                                <th className="pb-3 px-4 font-medium">Data</th>
                                <th className="pb-3 px-4 font-medium">
                                  Motivo
                                </th>
                                <th className="pb-3 px-4 font-medium text-right">
                                  Valor depositado
                                </th>
                                <th className="pb-3 px-4 text-center">
                                  Excluir
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                              {contributions.length === 0 ? (
                                <tr>
                                  <td
                                    colSpan="4"
                                    className="text-center py-10 text-zinc-500"
                                  >
                                    <i className="fas fa-coins text-3xl mb-2 block"></i>
                                    Nenhum depósito registrado ainda.
                                  </td>
                                </tr>
                              ) : (
                                contributions.map((c) => (
                                  <tr
                                    key={c.id}
                                    className="hover:bg-white/5 transition-colors"
                                  >
                                    <td className="py-4 px-4 text-zinc-300">
                                      {c.date?.toLocaleDateString("pt-BR")}
                                    </td>
                                    <td className="py-4 px-4 text-zinc-400">
                                      {c.type === "initial"
                                        ? "Depósito Inicial"
                                        : "Depósito Manual"}
                                    </td>
                                    <td className="py-4 px-4 font-bold text-green-400 text-right">
                                      +{formatarMoeda(c.value)}
                                    </td>
                                    <td className="py-4 px-4 text-center">
                                      <Tooltip text="Excluir depósito">
                                        <button
                                          onClick={() =>
                                            setDeleteModal({
                                              isOpen: true,
                                              type: "contribution",
                                              goalId: selectedGoal.id,
                                              contribId: c.id,
                                            })
                                          }
                                          className="text-zinc-500 hover:text-red-500 transition-colors p-2"
                                        >
                                          <i className="fas fa-trash-alt"></i>
                                        </button>
                                      </Tooltip>
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

      {/* Modal Lateral (Formulário) mais elegante */}
      {isFormOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={closeForm}
        ></div>
      )}
      <div
        className={`fixed right-0 top-0 h-full w-full max-w-md bg-zinc-900 border-l border-white/10 shadow-2xl z-50 overflow-y-auto custom-scroll transition-transform duration-300 ${isFormOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold bg-gradient-to-r from-green-400 to-green-600 bg-clip-text text-transparent">
              {editingGoal ? "Editar Meta" : "Nova Meta Financeira"}
            </h3>
            <button
              onClick={closeForm}
              className="text-zinc-400 hover:text-white text-2xl transition-colors"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>

          <form onSubmit={handleSaveGoal} className="space-y-5">
            <div>
              <label className="block text-sm text-zinc-300 mb-1">
                Nome da Meta *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:ring-2 focus:ring-green-500 transition-all"
                placeholder="Ex: Comprar um carro"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-300 mb-1">
                Descrição
              </label>
              <textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                rows="2"
                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:ring-2 focus:ring-green-500 resize-none transition-all"
                placeholder="Detalhes (Opcional)"
              ></textarea>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-zinc-300 mb-1">
                  Alvo (R$) *
                </label>
                <input
                  type="number"
                  value={formData.amount}
                  onChange={(e) =>
                    setFormData({ ...formData, amount: e.target.value })
                  }
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:ring-2 focus:ring-green-500"
                  min="0"
                  step="0.01"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-300 mb-1">
                  Já tenho (R$)
                </label>
                <input
                  type="number"
                  value={formData.currentAmount}
                  onChange={(e) =>
                    setFormData({ ...formData, currentAmount: e.target.value })
                  }
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:ring-2 focus:ring-green-500"
                  min="0"
                  step="0.01"
                  disabled={editingGoal !== null}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-zinc-300 mb-1">
                  Data Limite *
                </label>
                <input
                  type="date"
                  value={formData.deadline}
                  onChange={(e) =>
                    setFormData({ ...formData, deadline: e.target.value })
                  }
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:ring-2 focus:ring-green-500 [color-scheme:dark]"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-300 mb-1">
                  Prioridade
                </label>
                <select
                  value={formData.priority}
                  onChange={(e) =>
                    setFormData({ ...formData, priority: e.target.value })
                  }
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:ring-2 focus:ring-green-500"
                >
                  <option value="low">Baixa</option>
                  <option value="medium">Média</option>
                  <option value="high">Alta</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm text-zinc-300 mb-1">
                Categoria (Opcional)
              </label>
              <select
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:ring-2 focus:ring-green-500"
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

            <div className="pt-4 flex space-x-3">
              <button
                type="button"
                onClick={closeForm}
                className="flex-1 py-3 bg-zinc-800 border border-zinc-700 text-white rounded-lg hover:bg-zinc-700 font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-bold shadow-md transition-all hover:scale-105 active:scale-95"
              >
                {editingGoal ? "Salvar Edição" : "Criar Meta"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Modal de Exclusão (Central) */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60]">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm p-6 m-4 animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-red-500/20 p-2 rounded-full">
                <i className="fas fa-exclamation-triangle text-red-500 text-xl"></i>
              </div>
              <h3 className="text-xl font-bold text-white">
                {deleteModal.type === "goal"
                  ? "Excluir Meta?"
                  : "Excluir Depósito?"}
              </h3>
            </div>
            <p className="text-zinc-400 mb-6">
              {deleteModal.type === "goal"
                ? "Todas as contribuições atreladas a ela também serão removidas. Essa ação não pode ser desfeita."
                : "Este depósito será removido e o valor subtraído do progresso da sua meta."}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() =>
                  setDeleteModal({
                    isOpen: false,
                    type: "",
                    goalId: null,
                    contribId: null,
                  })
                }
                className="px-5 py-2 rounded-lg font-medium text-white bg-zinc-800 hover:bg-zinc-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className="px-5 py-2 rounded-lg font-bold text-white bg-red-600 hover:bg-red-700 transition-colors shadow-lg"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
