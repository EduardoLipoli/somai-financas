import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import "firebase/compat/firestore";
import { auth } from "../firebase/config";
import Sidebar from "../components/Sidebar";

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

export default function Configuracoes() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("userSettings");

  // Alertas
  const [alertMsg, setAlertMsg] = useState(null);

  // Estados - Usuário
  const [newName, setNewName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  // Estados - Categorias
  const [categoryType, setCategoryType] = useState("Gasto");
  const [categories, setCategories] = useState([]);
  const [newCategory, setNewCategory] = useState("");
  const [selectedCategories, setSelectedCategories] = useState([]);

  // Modais
  const [editModal, setEditModal] = useState({
    isOpen: false,
    id: null,
    name: "",
  });
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: "",
    text: "",
    action: null,
  });

  // Estados - Importação
  const [importFile, setImportFile] = useState(null);
  const [importStatus, setImportStatus] = useState("");

  const showAlert = (message, type = "success") => {
    setAlertMsg({ message, type });
    setTimeout(() => setAlertMsg(null), 3000);
  };

  // 1. Carrega Usuário e Categorias
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setNewName(currentUser.displayName || "");
        loadCategories(currentUser.uid, categoryType);
      } else {
        // Redireciona para o login se não houver usuário (Logout)
        navigate("/");
      }
    });
    return () => unsubscribe();
  }, [categoryType, navigate]);

  const loadCategories = async (uid, tipo) => {
    const db = firebase.firestore();
    const snap = await db
      .collection("users")
      .doc(uid)
      .collection("categories")
      .where("tipo", "==", tipo)
      .get();
    const cats = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    cats.sort((a, b) => a.name.localeCompare(b.name));
    setCategories(cats);
    setSelectedCategories([]);
  };

  // ==========================================
  // LOGOUT (Sair da Conta)
  // ==========================================
  const handleLogout = async () => {
    try {
      await auth.signOut();
      navigate("/");
    } catch (error) {
      showAlert("Erro ao sair da conta: " + error.message, "error");
    }
  };

  // ==========================================
  // AÇÕES DO USUÁRIO
  // ==========================================
  const handleUpdateName = async () => {
    if (!newName.trim()) return showAlert("Digite um nome válido.", "error");
    try {
      await user.updateProfile({ displayName: newName });
      showAlert("Nome atualizado com sucesso!", "success");
    } catch (error) {
      showAlert("Erro ao atualizar nome: " + error.message, "error");
    }
  };

  const handleUpdatePassword = async () => {
    if (newPassword.length < 6)
      return showAlert(
        "A nova senha deve ter pelo menos 6 caracteres.",
        "error",
      );
    try {
      const credential = firebase.auth.EmailAuthProvider.credential(
        user.email,
        currentPassword,
      );
      await user.reauthenticateWithCredential(credential);
      await user.updatePassword(newPassword);
      setCurrentPassword("");
      setNewPassword("");
      showAlert("Senha atualizada com sucesso!", "success");
    } catch (error) {
      showAlert("Erro ao atualizar senha: Verifique sua senha atual.", "error");
    }
  };

  // ==========================================
  // AÇÕES DE CATEGORIA
  // ==========================================
  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCategory.trim())
      return showAlert("O nome não pode estar vazio.", "error");
    const db = firebase.firestore();
    await db
      .collection("users")
      .doc(user.uid)
      .collection("categories")
      .add({ name: newCategory.trim(), tipo: categoryType });
    setNewCategory("");
    loadCategories(user.uid, categoryType);
    showAlert("Categoria salva com sucesso!", "success");
  };

  const handleEditCategory = async () => {
    if (!editModal.name.trim()) return;
    const db = firebase.firestore();
    await db
      .collection("users")
      .doc(user.uid)
      .collection("categories")
      .doc(editModal.id)
      .update({ name: editModal.name.trim() });
    setEditModal({ isOpen: false, id: null, name: "" });
    loadCategories(user.uid, categoryType);
  };

  const handleDeleteSelected = async () => {
    setConfirmModal({
      isOpen: true,
      title: "Excluir Categorias",
      text: `Tem certeza que deseja excluir ${selectedCategories.length} categoria(s)?`,
      action: async () => {
        const db = firebase.firestore();
        const batch = db.batch();
        selectedCategories.forEach((id) => {
          const ref = db
            .collection("users")
            .doc(user.uid)
            .collection("categories")
            .doc(id);
          batch.delete(ref);
        });
        await batch.commit();
        setConfirmModal({ isOpen: false });
        loadCategories(user.uid, categoryType);
        showAlert("Categorias excluídas com sucesso!", "success");
      },
    });
  };

  const toggleSelectAll = (e) => {
    if (e.target.checked) setSelectedCategories(categories.map((c) => c.id));
    else setSelectedCategories([]);
  };

  const toggleCategorySelection = (id) => {
    if (selectedCategories.includes(id))
      setSelectedCategories(selectedCategories.filter((catId) => catId !== id));
    else setSelectedCategories([...selectedCategories, id]);
  };

  const handleRestoreDefaults = () => {
    setConfirmModal({
      isOpen: true,
      title: "Restaurar Categorias",
      text: "Deseja restaurar as categorias padrão? Isso não apagará as que você já criou.",
      action: async () => {
        const db = firebase.firestore();
        const ref = db
          .collection("users")
          .doc(user.uid)
          .collection("categories");
        const defExpenses = [
          "🚗 Transporte",
          "📞 Comunicação",
          "📚 Educação",
          "🏠 Moradia",
          "🛍️ Compras e Parcelamentos",
          "👨‍👩‍👧‍👦 Gastos Pessoais",
          "💳 Bancos e Créditos",
        ];
        const defIncomes = [
          "💼 Salário",
          "🧾 Reembolso",
          "💸 Transferência recebida",
          "📈 Investimentos",
          "🎁 Presentes / Extras",
        ];

        for (let name of defExpenses) await ref.add({ name, tipo: "Gasto" });
        for (let name of defIncomes) await ref.add({ name, tipo: "Ganho" });

        setConfirmModal({ isOpen: false });
        loadCategories(user.uid, categoryType);
        showAlert("Categorias padrão restauradas!", "success");
      },
    });
  };

  // ==========================================
  // BACKUP: EXPORTAR E IMPORTAR
  // ==========================================
  const handleExportData = async () => {
    try {
      const db = firebase.firestore();
      const catsSnap = await db
        .collection("users")
        .doc(user.uid)
        .collection("categories")
        .get();
      const txsSnap = await db
        .collection("users")
        .doc(user.uid)
        .collection("transactions")
        .get();

      const exportedData = {
        meta: {
          exportedAt: new Date().toISOString(),
          userId: user.uid,
          version: "1.0",
        },
        categories: catsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        transactions: txsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      };

      const blob = new Blob([JSON.stringify(exportedData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `financas_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showAlert("Dados exportados com sucesso!", "success");
    } catch (error) {
      showAlert("Erro na exportação.", "error");
    }
  };

  const handleImportData = async () => {
    if (!importFile) return;
    setImportStatus("Processando arquivo...");
    try {
      const fileContent = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
        reader.readAsText(importFile);
      });

      const data = JSON.parse(fileContent);
      if (!data.categories || !data.transactions)
        throw new Error("Arquivo inválido");

      const db = firebase.firestore();
      const batch = db.batch();

      setImportStatus("Importando...");
      for (const cat of data.categories) {
        const ref = db
          .collection("users")
          .doc(user.uid)
          .collection("categories")
          .doc(cat.id);
        const doc = await ref.get();
        if (!doc.exists) batch.set(ref, { name: cat.name, tipo: cat.tipo });
      }

      for (const tx of data.transactions) {
        const ref = db
          .collection("users")
          .doc(user.uid)
          .collection("transactions")
          .doc(tx.id);
        const doc = await ref.get();
        if (!doc.exists) {
          const newDueDate = new Date(tx.dueDate.seconds * 1000);
          const newAddedOn = new Date(tx.addedOn.seconds * 1000);
          batch.set(ref, {
            ...tx,
            dueDate: firebase.firestore.Timestamp.fromDate(newDueDate),
            addedOn: firebase.firestore.Timestamp.fromDate(newAddedOn),
          });
        }
      }

      await batch.commit();
      setImportStatus("Importação concluída!");
      setImportFile(null);
      loadCategories(user.uid, categoryType);
      showAlert("Dados importados com sucesso!", "success");
    } catch (error) {
      setImportStatus(`Erro: ${error.message}`);
      showAlert("Erro na importação.", "error");
    }
  };

  if (!user)
    return <div className="bg-[#121212] lg:bg-zinc-900 h-screen"></div>;

  return (
    <div className="bg-[#121212] lg:bg-zinc-900 text-zinc-200 h-screen flex flex-col lg:grid lg:grid-cols-[auto,1fr] font-['Inter'] relative overflow-hidden">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Alerta Superior Responsivo */}
      {alertMsg && (
        <div
          className={`fixed top-4 left-4 right-4 lg:top-6 lg:left-auto lg:right-6 z-[100] px-5 py-3 rounded-xl shadow-2xl font-medium flex items-center gap-3 animate-fade-in ${
            alertMsg.type === "error"
              ? "bg-red-500/90 backdrop-blur-sm text-white border border-red-400"
              : "bg-[#22C55E]/90 backdrop-blur-sm text-white border border-[#22C55E]"
          }`}
        >
          <i
            className={`fas ${alertMsg.type === "error" ? "fa-exclamation-circle" : "fa-check-circle"} text-lg`}
          ></i>
          {alertMsg.message}
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* ─── CABEÇALHO DESKTOP ─── */}
        <header className="hidden lg:flex sticky top-0 z-10 bg-zinc-900/80 backdrop-blur-sm border-b border-white/10 items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <i className="fas fa-sliders-h text-[#22C55E] text-xl"></i>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-green-400 to-green-600 bg-clip-text text-transparent">
              Configurações
            </h1>
          </div>
        </header>

        {/* ─── CABEÇALHO MOBILE (Estilo App Somaí) ─── */}
        <header className="lg:hidden flex flex-col pt-10 px-5 pb-2 bg-[#121212]">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-[26px] font-bold text-white">Ajustes</h1>

            {/* NOVO BOTÃO DE LOGOUT MOBILE */}
            <button
              onClick={handleLogout}
              className="bg-[#EF4444]/10 text-[#EF4444] px-4 py-2.5 rounded-xl text-[13px] font-bold flex items-center gap-2 active:scale-95 transition-transform"
            >
              <i className="fas fa-sign-out-alt"></i> Sair
            </button>
          </div>

          {/* Menu Horizontal de Abas (Mobile) */}
          <div className="flex bg-[#1E1E1E] p-1.5 rounded-2xl mb-2 overflow-x-auto hide-scrollbar shadow-inner border border-white/5">
            <button
              onClick={() => setActiveTab("userSettings")}
              className={`flex-1 min-w-[90px] py-2.5 text-[12px] sm:text-[13px] font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 ${activeTab === "userSettings" ? "bg-[#22C55E] text-white shadow-md" : "text-zinc-500"}`}
            >
              <i className="fas fa-user"></i> Perfil
            </button>
            <button
              onClick={() => setActiveTab("categorySettings")}
              className={`flex-1 min-w-[90px] py-2.5 text-[12px] sm:text-[13px] font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 ${activeTab === "categorySettings" ? "bg-[#22C55E] text-white shadow-md" : "text-zinc-500"}`}
            >
              <i className="fas fa-tags"></i> Categorias
            </button>
            <button
              onClick={() => setActiveTab("exportImportSection")}
              className={`flex-1 min-w-[90px] py-2.5 text-[12px] sm:text-[13px] font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 ${activeTab === "exportImportSection" ? "bg-[#22C55E] text-white shadow-md" : "text-zinc-500"}`}
            >
              <i className="fas fa-database"></i> Backup
            </button>
            <button
              onClick={() => navigate("/metas")}
              className="flex-1 min-w-[90px] py-2.5 text-[12px] sm:text-[13px] font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 text-zinc-500 hover:text-white"
            >
              <i className="fas fa-bullseye"></i> Metas
            </button>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          {/* ─── MENU LATERAL DESKTOP ─── */}
          <aside className="hidden lg:flex flex-col w-64 bg-zinc-800/50 border-r border-white/10 p-5 flex-shrink-0 overflow-y-auto custom-scroll">
            <ul className="space-y-2">
              <li>
                <Tooltip text="Configurações de perfil e senha">
                  <button
                    onClick={() => setActiveTab("userSettings")}
                    className={`w-full text-left px-4 py-3 rounded-xl transition-all duration-200 flex items-center gap-3 ${
                      activeTab === "userSettings"
                        ? "bg-gradient-to-r from-green-600 to-green-700 text-white shadow-md"
                        : "text-zinc-400 hover:bg-zinc-700/50 hover:text-white"
                    }`}
                  >
                    <i className="fas fa-user"></i>
                    <span>Perfil</span>
                  </button>
                </Tooltip>
              </li>
              <li>
                <Tooltip text="Gerenciar categorias de despesas e receitas">
                  <button
                    onClick={() => setActiveTab("categorySettings")}
                    className={`w-full text-left px-4 py-3 rounded-xl transition-all duration-200 flex items-center gap-3 ${
                      activeTab === "categorySettings"
                        ? "bg-gradient-to-r from-green-600 to-green-700 text-white shadow-md"
                        : "text-zinc-400 hover:bg-zinc-700/50 hover:text-white"
                    }`}
                  >
                    <i className="fas fa-tags"></i>
                    <span>Categorias</span>
                  </button>
                </Tooltip>
              </li>
              <li>
                <Tooltip text="Exportar ou importar backup dos seus dados">
                  <button
                    onClick={() => setActiveTab("exportImportSection")}
                    className={`w-full text-left px-4 py-3 rounded-xl transition-all duration-200 flex items-center gap-3 ${
                      activeTab === "exportImportSection"
                        ? "bg-gradient-to-r from-green-600 to-green-700 text-white shadow-md"
                        : "text-zinc-400 hover:bg-zinc-700/50 hover:text-white"
                    }`}
                  >
                    <i className="fas fa-database"></i>
                    <span>Dados (Backup)</span>
                  </button>
                </Tooltip>
              </li>

              <li className="pt-4 mt-4 border-t border-white/5">
                <Tooltip text="Gerenciar suas metas financeiras">
                  <button
                    onClick={() => navigate("/metas")}
                    className="w-full text-left px-4 py-3 rounded-xl transition-all duration-200 flex items-center gap-3 text-zinc-400 hover:bg-zinc-700/50 hover:text-white"
                  >
                    <i className="fas fa-bullseye"></i>
                    <span>Metas</span>
                  </button>
                </Tooltip>
              </li>

              {/* NOVO BOTÃO DE LOGOUT NO DESKTOP */}
              <li className="pt-2">
                <Tooltip text="Sair da sua conta">
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-3 rounded-xl transition-all duration-200 flex items-center gap-3 text-red-500 hover:bg-red-500/10 hover:text-red-400 font-bold"
                  >
                    <i className="fas fa-sign-out-alt"></i>
                    <span>Sair da conta</span>
                  </button>
                </Tooltip>
              </li>
            </ul>
          </aside>

          {/* ─── ÁREA PRINCIPAL DE CONTEÚDO (Responsiva) ─── */}
          <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto bg-[#121212] lg:bg-zinc-900 custom-scroll pb-[100px] lg:pb-8">
            {/* ABA: USUÁRIO */}
            {activeTab === "userSettings" && (
              <div className="max-w-2xl mx-auto bg-[#1C1C1E] lg:bg-gradient-to-br lg:from-zinc-800 lg:to-zinc-800/80 rounded-[24px] lg:rounded-2xl shadow-xl border border-white/5 p-6 lg:p-8 animate-fade-in">
                <div className="flex items-center gap-3 border-b border-white/10 pb-6 mb-8">
                  <div className="bg-[#22C55E]/10 lg:bg-green-500/20 p-3 rounded-xl">
                    <i className="fas fa-user-cog text-[#22C55E] lg:text-green-400 text-xl"></i>
                  </div>
                  <h2 className="text-xl lg:text-2xl font-bold text-white">
                    Configurações do Perfil
                  </h2>
                </div>

                <div className="space-y-8">
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2 pl-1">
                      Alterar Nome de Exibição
                    </label>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="flex-1 px-4 py-3.5 lg:py-3 bg-[#121212] lg:bg-zinc-900 border border-white/5 lg:border-zinc-700 rounded-2xl lg:rounded-xl focus:ring-1 focus:ring-[#22C55E] transition text-white placeholder-zinc-600 outline-none"
                        placeholder="Seu nome"
                      />
                      <button
                        onClick={handleUpdateName}
                        className="bg-[#22C55E] hover:bg-green-600 text-black lg:text-white px-6 py-3.5 lg:py-3 rounded-2xl lg:rounded-xl font-bold transition-all active:scale-95 shadow-md"
                      >
                        Salvar
                      </button>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-white/5">
                    <label className="block text-sm font-medium text-zinc-400 mb-2 pl-1">
                      Alterar Senha
                    </label>
                    <div className="space-y-3">
                      <input
                        type="password"
                        placeholder="Senha atual"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full px-4 py-3.5 lg:py-3 bg-[#121212] lg:bg-zinc-900 border border-white/5 lg:border-zinc-700 rounded-2xl lg:rounded-xl focus:ring-1 focus:ring-[#22C55E] transition text-white outline-none"
                      />
                      <input
                        type="password"
                        placeholder="Nova senha (min. 6 caracteres)"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-4 py-3.5 lg:py-3 bg-[#121212] lg:bg-zinc-900 border border-white/5 lg:border-zinc-700 rounded-2xl lg:rounded-xl focus:ring-1 focus:ring-[#22C55E] transition text-white outline-none"
                      />
                      <button
                        onClick={handleUpdatePassword}
                        className="w-full bg-[#EF4444]/10 border border-[#EF4444]/20 text-[#EF4444] hover:bg-[#EF4444] hover:text-white py-3.5 lg:py-3 rounded-2xl lg:rounded-xl font-bold transition-all mt-2"
                      >
                        <i className="fas fa-key mr-2"></i>Alterar Senha
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ABA: CATEGORIAS */}
            {activeTab === "categorySettings" && (
              <div className="max-w-3xl mx-auto bg-[#1C1C1E] lg:bg-gradient-to-br lg:from-zinc-800 lg:to-zinc-800/80 rounded-[24px] lg:rounded-2xl shadow-xl border border-white/5 p-6 lg:p-8 animate-fade-in">
                <div className="flex flex-wrap justify-between items-center gap-4 border-b border-white/10 pb-6 mb-8">
                  <div className="flex items-center gap-3">
                    <div className="bg-[#22C55E]/10 lg:bg-green-500/20 p-3 rounded-xl">
                      <i className="fas fa-tag text-[#22C55E] lg:text-green-400 text-xl"></i>
                    </div>
                    <h2 className="text-xl lg:text-2xl font-bold text-white">
                      Gerenciar Categorias
                    </h2>
                  </div>
                  <Tooltip text="Restaurar categorias padrão">
                    <button
                      onClick={handleRestoreDefaults}
                      className="text-[13px] font-semibold text-zinc-400 hover:text-white transition-colors flex items-center gap-1.5 bg-[#121212] lg:bg-zinc-800 px-3 py-1.5 rounded-lg border border-white/5"
                    >
                      <i className="fas fa-undo-alt"></i> Restaurar
                    </button>
                  </Tooltip>
                </div>

                {/* Toggle Despesas/Receitas */}
                <div className="flex gap-2 mb-6 p-1.5 bg-[#121212] lg:bg-zinc-900/50 rounded-2xl lg:rounded-xl w-full sm:w-fit border border-white/5">
                  <button
                    onClick={() => setCategoryType("Gasto")}
                    className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl font-bold transition-all duration-200 text-sm ${
                      categoryType === "Gasto"
                        ? "bg-[#EF4444] text-white shadow-md"
                        : "text-zinc-500 hover:text-white"
                    }`}
                  >
                    <i className="fas fa-arrow-down mr-2"></i>Despesas
                  </button>
                  <button
                    onClick={() => setCategoryType("Ganho")}
                    className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl font-bold transition-all duration-200 text-sm ${
                      categoryType === "Ganho"
                        ? "bg-[#22C55E] text-white shadow-md"
                        : "text-zinc-500 hover:text-white"
                    }`}
                  >
                    <i className="fas fa-arrow-up mr-2"></i>Receitas
                  </button>
                </div>

                {/* Formulário de nova categoria */}
                <form
                  onSubmit={handleAddCategory}
                  className="flex flex-col sm:flex-row gap-3 mb-6"
                >
                  <input
                    type="text"
                    placeholder={`Nova categoria de ${categoryType === "Gasto" ? "Despesa" : "Receita"}...`}
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="flex-1 px-4 py-3.5 lg:py-3 bg-[#121212] lg:bg-zinc-900 border border-white/5 lg:border-zinc-700 rounded-2xl lg:rounded-xl focus:ring-1 focus:ring-[#22C55E] transition text-white outline-none"
                  />
                  <button
                    type="submit"
                    className="bg-[#22C55E] lg:bg-green-600 hover:bg-green-700 text-black lg:text-white px-6 py-3.5 lg:py-3 rounded-2xl lg:rounded-xl font-bold transition-all active:scale-95 shadow-md flex items-center justify-center gap-2"
                  >
                    <i className="fas fa-plus"></i> Adicionar
                  </button>
                </form>

                {/* Lista de categorias */}
                <div className="bg-[#121212] lg:bg-zinc-900/50 border border-white/5 lg:border-white/10 rounded-[20px] lg:rounded-xl overflow-hidden shadow-inner">
                  <div className="flex flex-wrap justify-between items-center gap-3 p-4 bg-[#1C1C1E] lg:bg-zinc-800/30 border-b border-white/5 lg:border-white/10">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={
                          selectedCategories.length === categories.length &&
                          categories.length > 0
                        }
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-zinc-600 bg-[#121212] text-[#22C55E] focus:ring-[#22C55E] focus:ring-offset-0"
                      />
                      <span className="text-sm font-semibold text-zinc-300">
                        Selecionar Todos
                      </span>
                    </label>
                    {selectedCategories.length > 0 && (
                      <Tooltip text="Excluir categorias selecionadas">
                        <button
                          onClick={handleDeleteSelected}
                          className="bg-[#EF4444]/20 text-[#EF4444] hover:bg-[#EF4444] hover:text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2 uppercase tracking-wide"
                        >
                          <i className="fas fa-trash-alt"></i> Excluir (
                          {selectedCategories.length})
                        </button>
                      </Tooltip>
                    )}
                  </div>

                  <ul className="max-h-[400px] overflow-y-auto custom-scroll">
                    {categories.length === 0 ? (
                      <li className="p-8 text-center text-zinc-600 flex flex-col items-center gap-2 font-medium">
                        <i className="fas fa-folder-open text-3xl mb-1"></i>
                        Nenhuma categoria encontrada.
                      </li>
                    ) : (
                      categories.map((cat) => (
                        <li
                          key={cat.id}
                          onClick={() => toggleCategorySelection(cat.id)}
                          className={`flex justify-between items-center p-4 border-b border-white/5 cursor-pointer transition-all duration-150 hover:bg-[#1C1C1E] lg:hover:bg-zinc-800/50 ${
                            selectedCategories.includes(cat.id)
                              ? "bg-[#22C55E]/10 border-l-4 border-[#22C55E]"
                              : "border-l-4 border-transparent"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={selectedCategories.includes(cat.id)}
                              readOnly
                              className="w-4 h-4 rounded border-zinc-600 bg-[#121212] text-[#22C55E] focus:ring-[#22C55E]"
                            />
                            <span className="text-zinc-200 font-medium text-[15px] lg:text-base">
                              {cat.name}
                            </span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditModal({
                                isOpen: true,
                                id: cat.id,
                                name: cat.name,
                              });
                            }}
                            className="text-zinc-500 hover:text-[#22C55E] p-2.5 rounded-xl hover:bg-[#121212] lg:hover:bg-zinc-700 transition-colors"
                          >
                            <i className="fas fa-pen"></i>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            )}

            {/* ABA: BACKUP */}
            {activeTab === "exportImportSection" && (
              <div className="max-w-3xl mx-auto bg-[#1C1C1E] lg:bg-gradient-to-br lg:from-zinc-800 lg:to-zinc-800/80 rounded-[24px] lg:rounded-2xl shadow-xl border border-white/5 p-6 lg:p-8 animate-fade-in">
                <div className="flex items-center gap-3 border-b border-white/10 pb-6 mb-8">
                  <div className="bg-[#3B82F6]/10 lg:bg-blue-500/20 p-3 rounded-xl">
                    <i className="fas fa-database text-[#3B82F6] lg:text-blue-400 text-xl"></i>
                  </div>
                  <h2 className="text-xl lg:text-2xl font-bold text-white">
                    Backup de Dados
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
                  {/* Exportar */}
                  <div className="bg-[#121212] lg:bg-zinc-900/50 rounded-[20px] lg:rounded-xl p-6 border border-white/5 lg:border-white/10 hover:border-[#3B82F6]/30 transition-all duration-300">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="bg-[#3B82F6]/10 p-2.5 rounded-xl">
                        <i className="fas fa-file-export text-[#3B82F6] text-lg"></i>
                      </div>
                      <h3 className="text-lg font-bold text-white">Exportar</h3>
                    </div>
                    <p className="text-[13px] lg:text-sm text-zinc-400 mb-6 leading-relaxed">
                      Baixe um arquivo JSON com todas as suas transações e
                      categorias para guardar em segurança.
                    </p>
                    <button
                      onClick={handleExportData}
                      className="w-full bg-[#3B82F6] hover:bg-blue-600 text-white py-3.5 lg:py-3 rounded-2xl lg:rounded-xl font-bold transition-all active:scale-95 shadow-md flex items-center justify-center gap-2"
                    >
                      <i className="fas fa-download"></i> Exportar Dados
                    </button>
                  </div>

                  {/* Importar */}
                  <div className="bg-[#121212] lg:bg-zinc-900/50 rounded-[20px] lg:rounded-xl p-6 border border-white/5 lg:border-white/10 hover:border-[#22C55E]/30 transition-all duration-300">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="bg-[#22C55E]/10 p-2.5 rounded-xl">
                        <i className="fas fa-file-import text-[#22C55E] text-lg"></i>
                      </div>
                      <h3 className="text-lg font-bold text-white">Importar</h3>
                    </div>
                    <p className="text-[13px] lg:text-sm text-zinc-400 mb-4 leading-relaxed">
                      Restaure um backup anterior selecionando o arquivo JSON
                      gerado pelo sistema.
                    </p>

                    <input
                      type="file"
                      id="fileUpload"
                      accept=".json"
                      onChange={(e) => setImportFile(e.target.files[0])}
                      className="hidden"
                    />
                    <div className="flex gap-2 mb-4">
                      <label
                        htmlFor="fileUpload"
                        className="flex-1 bg-[#1C1C1E] lg:bg-zinc-800 border border-white/5 lg:border-zinc-600 text-center py-3 lg:py-2.5 rounded-2xl lg:rounded-xl cursor-pointer text-sm font-bold text-white transition-all flex items-center justify-center gap-2 active:scale-95"
                      >
                        <i className="fas fa-folder-open"></i> Escolher Arquivo
                      </label>
                    </div>
                    {importFile && (
                      <p className="text-xs text-[#22C55E] mb-4 text-center truncate bg-[#22C55E]/10 py-1.5 px-3 rounded-full font-bold">
                        <i className="fas fa-check-circle mr-1"></i>{" "}
                        {importFile.name}
                      </p>
                    )}

                    <button
                      onClick={handleImportData}
                      disabled={!importFile}
                      className="w-full bg-[#22C55E] lg:bg-green-600 disabled:opacity-30 disabled:bg-zinc-700 disabled:text-zinc-500 text-black lg:text-white py-3.5 lg:py-3 rounded-2xl lg:rounded-xl font-bold transition-all active:scale-95 shadow-md flex items-center justify-center gap-2"
                    >
                      <i className="fas fa-upload"></i> Restaurar Backup
                    </button>
                    {importStatus && (
                      <p className="text-xs text-center mt-3 text-zinc-400 bg-zinc-800/30 py-1 rounded-full font-medium">
                        {importStatus}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
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

        {/* Placeholder central (inativo em Configurações para dar foco nas abas) */}
        <div className="relative -top-7">
          <button
            onClick={() => navigate("/dashboard")}
            className="bg-[#2A2A2A] text-zinc-500 h-[64px] w-[64px] rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform border border-white/5"
          >
            <i className="bi bi-house text-[28px]"></i>
          </button>
        </div>

        <button
          onClick={() => navigate("/receitas")}
          className="flex flex-col items-center text-zinc-500"
        >
          <i className="bi bi-arrow-up-circle text-[24px]"></i>
          <span className="text-[10px] mt-1 font-medium">Receitas</span>
        </button>
        <button
          onClick={() => navigate("/configuracoes")}
          className="flex flex-col items-center text-[#22C55E] font-bold"
        >
          <i className="bi bi-gear-fill text-[24px]"></i>
          <span className="text-[10px] mt-1">Ajustes</span>
        </button>
      </nav>

      {/* Modal Genérico de Confirmação */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[110] p-5">
          <div className="bg-[#1C1C1E] border border-white/10 rounded-[28px] p-6 w-full max-w-xs shadow-2xl animate-fade-in">
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-yellow-500/10 p-2 rounded-xl">
                <i className="fas fa-exclamation-triangle text-yellow-500 text-lg"></i>
              </div>
              <h3 className="text-lg font-bold text-white">
                {confirmModal.title}
              </h3>
            </div>
            <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
              {confirmModal.text}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={confirmModal.action}
                className="w-full py-3.5 bg-red-600 text-white rounded-2xl text-xs font-bold uppercase tracking-wider"
              >
                Confirmar
              </button>
              <button
                onClick={() => setConfirmModal({ isOpen: false })}
                className="w-full py-3.5 text-zinc-500 text-xs font-bold uppercase tracking-wider"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Editar Categoria */}
      {editModal.isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[110] p-5">
          <div className="bg-[#1C1C1E] border border-white/10 rounded-[28px] p-6 w-full max-w-xs shadow-2xl animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-[#22C55E]/10 p-2 rounded-xl">
                <i className="fas fa-pen text-[#22C55E] text-lg"></i>
              </div>
              <h3 className="text-lg font-bold text-white">Editar Categoria</h3>
            </div>
            <input
              type="text"
              value={editModal.name}
              onChange={(e) =>
                setEditModal({ ...editModal, name: e.target.value })
              }
              className="w-full p-3.5 bg-[#121212] border border-white/5 rounded-2xl text-white focus:ring-1 focus:ring-[#22C55E] transition mb-6 outline-none"
              autoFocus
            />
            <div className="flex flex-col gap-2">
              <button
                onClick={handleEditCategory}
                className="w-full py-3.5 bg-[#22C55E] text-black rounded-2xl text-xs font-bold uppercase tracking-wider"
              >
                Salvar Categoria
              </button>
              <button
                onClick={() =>
                  setEditModal({ isOpen: false, id: null, name: "" })
                }
                className="w-full py-3.5 text-zinc-500 text-xs font-bold uppercase tracking-wider"
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
