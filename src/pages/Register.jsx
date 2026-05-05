import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../firebase/config";

export default function Register() {
  const navigate = useNavigate();

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        navigate("/dashboard");
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const showAlert = (message, type = "success") => {
    setAlert({ message, type });
    setTimeout(() => setAlert(null), 3000);
  };

  const validateEmail = (email) => {
    const re = /\S+@\S+\.\S+/;
    return re.test(email);
  };

  const isEmailValid = email.length > 0 && validateEmail(email);
  const isPasswordValid = password.length >= 6;
  const isPasswordMatch =
    password === confirmPassword && confirmPassword.length > 0;
  const isFormValid =
    nome.length > 0 && isEmailValid && isPasswordValid && isPasswordMatch;

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const userCredential = await auth.createUserWithEmailAndPassword(
        email,
        password,
      );
      const user = userCredential.user;
      await user.updateProfile({
        displayName: nome,
      });
      console.log("Nome atualizado:", auth.currentUser.displayName);
      navigate("/dashboard");
    } catch (error) {
      if (error.code === "auth/email-already-in-use") {
        showAlert("Email já cadastrado", "error");
      } else {
        showAlert(error.message, "error");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[url('/images/background.jpg')] bg-cover bg-center bg-no-repeat min-h-screen flex items-center justify-center p-4">
      {/* Alerta Customizado */}
      {alert && (
        <div
          className={`fixed top-6 right-4 z-50 flex items-center px-4 py-3 rounded-xl shadow-lg ${alert.type === "error" ? "bg-red-500 text-white" : "bg-green-500 text-white"}`}
        >
          <span>{alert.message}</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="loading bg-black/50 fixed w-full h-full top-0 left-0 flex justify-center items-center z-[1000] backdrop-blur-sm">
          <div className="loader-circle w-[50px] h-[50px] rounded-full border-[10px] border-[#27272A] border-t-[#22c55e] animate-spin"></div>
        </div>
      )}

      <div className="w-full max-w-md">
        <div className="bg-zinc-800/90 text-zinc-200 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6 backdrop-blur-sm border border-zinc-700/50 transition-all duration-300">
          <h1 className="text-2xl sm:text-3xl font-bold text-center tracking-tight">
            Cadastre-se
          </h1>

          <p className="text-sm text-center text-zinc-400">
            Já possui uma conta?{" "}
            <Link to="/" className="text-green-500 hover:underline font-medium">
              Login
            </Link>
          </p>

          <form className="space-y-5" onSubmit={handleRegister}>
            {/* Nome */}
            <div>
              <label
                htmlFor="nome"
                className="block text-sm font-medium text-zinc-300"
              >
                Nome
              </label>
              <input
                type="text"
                id="nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full mt-1 px-4 py-2.5 bg-zinc-900 border border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 text-zinc-100 placeholder-zinc-500"
                placeholder="Seu nome completo"
              />
              {nome.length === 0 && (
                <div className="text-sm text-red-400 mt-1 ml-1">
                  Nome é obrigatório
                </div>
              )}
            </div>

            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-zinc-300"
              >
                E-mail
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full mt-1 px-4 py-2.5 bg-zinc-900 border border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 text-zinc-100 placeholder-zinc-500"
                placeholder="seu@email.com"
              />
              {email.length > 0 && !validateEmail(email) && (
                <div className="text-sm text-red-400 mt-1 ml-1">
                  Email inválido
                </div>
              )}
            </div>

            {/* Senha */}
            <div className="relative">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-zinc-300"
              >
                Senha
              </label>
              <div className="relative mt-1">
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 pr-12 bg-zinc-900 border border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 text-zinc-100 placeholder-zinc-500"
                  placeholder="••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-green-500 transition-colors duration-200"
                >
                  <i
                    className={`bi ${showPassword ? "bi-eye-slash" : "bi-eye"} text-xl`}
                  ></i>
                </button>
              </div>
              {password.length > 0 && password.length < 6 && (
                <div className="text-sm text-red-400 mt-1 ml-1">
                  Senha deve ter pelo menos 6 caracteres
                </div>
              )}
            </div>

            {/* Confirmar Senha */}
            <div className="relative">
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-zinc-300"
              >
                Confirmar Senha
              </label>
              <div className="relative mt-1">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2.5 pr-12 bg-zinc-900 border border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 text-zinc-100 placeholder-zinc-500"
                  placeholder="••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-green-500 transition-colors duration-200"
                >
                  <i
                    className={`bi ${showConfirmPassword ? "bi-eye-slash" : "bi-eye"} text-xl`}
                  ></i>
                </button>
              </div>
              {confirmPassword.length > 0 && password !== confirmPassword && (
                <div className="text-sm text-red-400 mt-1 ml-1">
                  As senhas não coincidem
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={!isFormValid}
              className="w-full mt-6 bg-green-500 hover:bg-green-600 text-zinc-900 font-semibold py-2.5 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-zinc-800"
            >
              Registrar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
