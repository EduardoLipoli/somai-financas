import React, { useEffect, useState } from "react";
import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import "firebase/compat/firestore";
import { auth } from "../firebase/config";
import Sidebar from "../components/Sidebar";

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

export default function Configuracoes() {
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
      }
    });
    return () => unsubscribe();
  }, [categoryType]);

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

  if (!user) return <div className="bg-zinc-900 h-screen"></div>;

  return (
    <div className="bg-zinc-900 text-zinc-200 h-screen grid grid-cols-[auto,1fr] font-['Inter'] overflow-hidden">
      <Sidebar />

      {/* Alerta Superior com animação e ícone */}
      {alertMsg && (
        <div
          className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-2xl font-medium flex items-center gap-3 animate-fade-in ${alertMsg.type === "error" ? "bg-red-500/90 backdrop-blur-sm text-white border border-red-400" : "bg-green-500/90 backdrop-blur-sm text-white border border-green-400"}`}
        >
          <i
            className={`fas ${alertMsg.type === "error" ? "fa-exclamation-circle" : "fa-check-circle"} text-lg`}
          ></i>
          {alertMsg.message}
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Cabeçalho com gradiente e ícone */}
        <header className="sticky top-0 z-10 bg-zinc-900/80 backdrop-blur-sm border-b border-white/10 flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <i className="fas fa-sliders-h text-green-500 text-xl"></i>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-green-400 to-green-600 bg-clip-text text-transparent">
              Configurações
            </h1>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          {/* Menu Lateral de Configurações com design aprimorado */}
          <aside className="w-64 bg-zinc-800/50 border-r border-white/10 p-5 flex-shrink-0 overflow-y-auto custom-scroll">
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
            </ul>
          </aside>

          {/* Área Principal de Conteúdo */}
          <main className="flex-1 p-6 lg:p-8 overflow-y-auto bg-zinc-900 custom-scroll">
            {/* ABA: USUÁRIO */}
            {activeTab === "userSettings" && (
              <div className="max-w-2xl mx-auto bg-gradient-to-br from-zinc-800 to-zinc-800/80 rounded-2xl shadow-xl border border-white/5 p-8 animate-fade-in">
                <div className="flex items-center gap-3 border-b border-white/10 pb-6 mb-8">
                  <div className="bg-green-500/20 p-3 rounded-xl">
                    <i className="fas fa-user-cog text-green-400 text-xl"></i>
                  </div>
                  <h2 className="text-2xl font-bold text-white">
                    Configurações do Perfil
                  </h2>
                </div>

                <div className="space-y-8">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      Alterar Nome de Exibição
                    </label>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="flex-1 px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl focus:ring-2 focus:ring-green-500 transition text-white placeholder-zinc-500"
                        placeholder="Seu nome"
                      />
                      <button
                        onClick={handleUpdateName}
                        className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-medium transition-all hover:scale-105 active:scale-95 shadow-md"
                      >
                        Salvar
                      </button>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-white/10">
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      Alterar Senha
                    </label>
                    <div className="space-y-3">
                      <input
                        type="password"
                        placeholder="Senha atual"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl focus:ring-2 focus:ring-green-500 transition text-white"
                      />
                      <input
                        type="password"
                        placeholder="Nova senha (min. 6 caracteres)"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl focus:ring-2 focus:ring-green-500 transition text-white"
                      />
                      <button
                        onClick={handleUpdatePassword}
                        className="w-full bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white py-3 rounded-xl font-medium transition-all"
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
              <div className="max-w-3xl mx-auto bg-gradient-to-br from-zinc-800 to-zinc-800/80 rounded-2xl shadow-xl border border-white/5 p-8 animate-fade-in">
                <div className="flex flex-wrap justify-between items-center gap-4 border-b border-white/10 pb-6 mb-8">
                  <div className="flex items-center gap-3">
                    <div className="bg-green-500/20 p-3 rounded-xl">
                      <i className="fas fa-tag text-green-400 text-xl"></i>
                    </div>
                    <h2 className="text-2xl font-bold text-white">
                      Gerenciar Categorias
                    </h2>
                  </div>
                  <Tooltip text="Restaurar categorias padrão do sistema">
                    <button
                      onClick={handleRestoreDefaults}
                      className="text-sm text-zinc-400 hover:text-white transition-colors flex items-center gap-1"
                    >
                      <i className="fas fa-undo-alt"></i> Restaurar Padrões
                    </button>
                  </Tooltip>
                </div>

                {/* Toggle Despesas/Receitas */}
                <div className="flex gap-2 mb-8 p-1 bg-zinc-900/50 rounded-xl w-fit">
                  <button
                    onClick={() => setCategoryType("Gasto")}
                    className={`px-6 py-2.5 rounded-lg font-medium transition-all duration-200 ${
                      categoryType === "Gasto"
                        ? "bg-gradient-to-r from-red-600 to-red-700 text-white shadow-md"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    <i className="fas fa-arrow-down mr-2"></i>Despesas
                  </button>
                  <button
                    onClick={() => setCategoryType("Ganho")}
                    className={`px-6 py-2.5 rounded-lg font-medium transition-all duration-200 ${
                      categoryType === "Ganho"
                        ? "bg-gradient-to-r from-green-600 to-green-700 text-white shadow-md"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    <i className="fas fa-arrow-up mr-2"></i>Receitas
                  </button>
                </div>

                {/* Formulário de nova categoria */}
                <form
                  onSubmit={handleAddCategory}
                  className="flex flex-col sm:flex-row gap-3 mb-8"
                >
                  <input
                    type="text"
                    placeholder={`Nova categoria de ${categoryType === "Gasto" ? "Despesa" : "Receita"}...`}
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="flex-1 px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl focus:ring-2 focus:ring-green-500 transition text-white"
                  />
                  <button
                    type="submit"
                    className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-bold transition-all hover:scale-105 active:scale-95 shadow-md flex items-center justify-center gap-2"
                  >
                    <i className="fas fa-plus"></i> Adicionar
                  </button>
                </form>

                {/* Lista de categorias */}
                <div className="bg-zinc-900/50 border border-white/10 rounded-xl overflow-hidden">
                  <div className="flex flex-wrap justify-between items-center gap-3 p-4 bg-zinc-800/30 border-b border-white/10">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={
                          selectedCategories.length === categories.length &&
                          categories.length > 0
                        }
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-zinc-500 text-green-500 focus:ring-green-500 focus:ring-offset-0"
                      />
                      <span className="text-sm font-medium text-zinc-300">
                        Selecionar Todos
                      </span>
                    </label>
                    {selectedCategories.length > 0 && (
                      <Tooltip text="Excluir categorias selecionadas">
                        <button
                          onClick={handleDeleteSelected}
                          className="bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                        >
                          <i className="fas fa-trash-alt"></i> Excluir (
                          {selectedCategories.length})
                        </button>
                      </Tooltip>
                    )}
                  </div>

                  <ul className="max-h-[400px] overflow-y-auto custom-scroll">
                    {categories.length === 0 ? (
                      <li className="p-8 text-center text-zinc-500 flex flex-col items-center gap-2">
                        <i className="fas fa-folder-open text-3xl"></i>
                        Nenhuma categoria encontrada.
                      </li>
                    ) : (
                      categories.map((cat) => (
                        <li
                          key={cat.id}
                          onClick={() => toggleCategorySelection(cat.id)}
                          className={`flex justify-between items-center p-4 border-b border-white/5 cursor-pointer transition-all duration-150 hover:bg-zinc-800/50 ${
                            selectedCategories.includes(cat.id)
                              ? "bg-green-900/20 border-l-4 border-green-500"
                              : ""
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={selectedCategories.includes(cat.id)}
                              readOnly
                              className="w-4 h-4 rounded border-zinc-500 text-green-500 focus:ring-green-500"
                            />
                            <span className="text-zinc-200">{cat.name}</span>
                          </div>
                          <Tooltip text="Editar categoria">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditModal({
                                  isOpen: true,
                                  id: cat.id,
                                  name: cat.name,
                                });
                              }}
                              className="text-zinc-500 hover:text-green-400 p-2 rounded-lg hover:bg-zinc-700 transition-colors"
                            >
                              <i className="fas fa-pen"></i>
                            </button>
                          </Tooltip>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            )}

            {/* ABA: BACKUP */}
            {activeTab === "exportImportSection" && (
              <div className="max-w-3xl mx-auto bg-gradient-to-br from-zinc-800 to-zinc-800/80 rounded-2xl shadow-xl border border-white/5 p-8 animate-fade-in">
                <div className="flex items-center gap-3 border-b border-white/10 pb-6 mb-8">
                  <div className="bg-blue-500/20 p-3 rounded-xl">
                    <i className="fas fa-database text-blue-400 text-xl"></i>
                  </div>
                  <h2 className="text-2xl font-bold text-white">
                    Exportar & Importar Dados
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Exportar */}
                  <div className="bg-zinc-900/50 rounded-xl p-6 border border-white/10 hover:border-blue-500/30 transition-all duration-300 group">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="bg-blue-500/20 p-2 rounded-lg group-hover:bg-blue-500/30 transition-colors">
                        <i className="fas fa-file-export text-blue-400 text-lg"></i>
                      </div>
                      <h3 className="text-lg font-bold text-white">
                        Exportar (Backup)
                      </h3>
                    </div>
                    <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
                      Baixe um arquivo JSON com todas as suas transações e
                      categorias. Guarde este arquivo em um local seguro.
                    </p>
                    <Tooltip text="Exportar todos os dados do sistema">
                      <button
                        onClick={handleExportData}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-medium transition-all hover:scale-105 active:scale-95 shadow-md flex items-center justify-center gap-2"
                      >
                        <i className="fas fa-download"></i> Exportar Meus Dados
                      </button>
                    </Tooltip>
                  </div>

                  {/* Importar */}
                  <div className="bg-zinc-900/50 rounded-xl p-6 border border-white/10 hover:border-green-500/30 transition-all duration-300 group">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="bg-green-500/20 p-2 rounded-lg group-hover:bg-green-500/30 transition-colors">
                        <i className="fas fa-file-import text-green-400 text-lg"></i>
                      </div>
                      <h3 className="text-lg font-bold text-white">
                        Importar Dados
                      </h3>
                    </div>
                    <p className="text-sm text-zinc-400 mb-4 leading-relaxed">
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
                        className="flex-1 bg-zinc-800 border border-zinc-600 hover:bg-zinc-700 text-center py-2.5 rounded-xl cursor-pointer text-sm font-medium text-white transition-all flex items-center justify-center gap-2"
                      >
                        <i className="fas fa-folder-open"></i> Escolher Arquivo
                      </label>
                    </div>
                    {importFile && (
                      <p className="text-xs text-green-400 mb-4 text-center truncate bg-zinc-800/50 py-1 px-2 rounded-full">
                        <i className="fas fa-check-circle mr-1"></i>{" "}
                        {importFile.name}
                      </p>
                    )}

                    <Tooltip
                      text={
                        !importFile
                          ? "Selecione um arquivo primeiro"
                          : "Restaurar backup"
                      }
                    >
                      <button
                        onClick={handleImportData}
                        disabled={!importFile}
                        className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl font-medium transition-all hover:scale-105 active:scale-95 shadow-md flex items-center justify-center gap-2"
                      >
                        <i className="fas fa-upload"></i> Restaurar Backup
                      </button>
                    </Tooltip>
                    {importStatus && (
                      <p className="text-xs text-center mt-3 text-zinc-400 bg-zinc-800/30 py-1 rounded-full">
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

      {/* Modal Genérico de Confirmação */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60]">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 w-96 shadow-2xl animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-yellow-500/20 p-2 rounded-full">
                <i className="fas fa-exclamation-triangle text-yellow-500 text-xl"></i>
              </div>
              <h3 className="text-xl font-bold text-white">
                {confirmModal.title}
              </h3>
            </div>
            <p className="text-zinc-300 mb-6 leading-relaxed">
              {confirmModal.text}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmModal({ isOpen: false })}
                className="px-4 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmModal.action}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-md"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Editar Categoria */}
      {editModal.isOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60]">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 w-96 shadow-2xl animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-green-500/20 p-2 rounded-full">
                <i className="fas fa-edit text-green-400 text-xl"></i>
              </div>
              <h3 className="text-xl font-bold text-white">Editar Categoria</h3>
            </div>
            <input
              type="text"
              value={editModal.name}
              onChange={(e) =>
                setEditModal({ ...editModal, name: e.target.value })
              }
              className="w-full p-3 bg-zinc-800 border border-zinc-600 rounded-xl text-white focus:ring-2 focus:ring-green-500 transition mb-6"
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() =>
                  setEditModal({ isOpen: false, id: null, name: "" })
                }
                className="px-4 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleEditCategory}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-md"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
