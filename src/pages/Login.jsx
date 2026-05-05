import React, { useState, useEffect } from "react";
import { auth, googleProvider } from "../firebase/config";
import firebase from "firebase/compat/app";
import { Link } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        window.location.href = "/dashboard";
      } else {
        const remembered = localStorage.getItem("rememberMe") === "true";
        setRememberMe(remembered);
      }
    });
    return () => unsubscribe();
  }, []);

  const showAlert = (message, type = "success") => {
    setAlert({ message, type });
    setTimeout(() => setAlert(null), 3000);
  };

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);

    localStorage.setItem("rememberMe", rememberMe);
    const persistence = rememberMe
      ? firebase.auth.Auth.Persistence.LOCAL
      : firebase.auth.Auth.Persistence.SESSION;

    try {
      await auth.setPersistence(persistence);
      await auth.signInWithEmailAndPassword(email, password);
      window.location.href = "/dashboard";
    } catch (error) {
      showAlert("Usuário ou senha inválidos!", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      await auth.signInWithPopup(googleProvider);
      window.location.href = "/dashboard";
    } catch (error) {
      showAlert("Erro no login com Google: " + error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = email.length > 0 && password.length > 0;

  return (
    <div className="bg-[url('/images/background.jpg')] bg-cover bg-center bg-no-repeat min-h-screen flex items-center justify-center p-4">
      {/* Alerta */}
      {alert && (
        <div
          className={`fixed top-6 right-4 z-50 flex items-center px-4 py-3 rounded-xl shadow-lg ${
            alert.type === "error"
              ? "bg-red-500 text-white"
              : "bg-green-500 text-white"
          }`}
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
            Bem Vindo Ao Somaí Finanças 💲
          </h1>
          <p className="text-sm text-center text-zinc-400">
            Ainda não possui uma conta?{" "}
            <Link
              to="/register"
              className="text-green-500 hover:underline font-medium"
            >
              Cadastrar-se
            </Link>
          </p>

          <div className="flex items-center space-x-2">
            <hr className="flex-grow border-zinc-600" />
          </div>

          <form className="space-y-5" onSubmit={handleLogin}>
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-zinc-300"
              >
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full mt-1 px-4 py-2.5 bg-zinc-900 border border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 text-zinc-100 placeholder-zinc-500"
                placeholder="seu@email.com"
              />
            </div>

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
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 accent-green-500 rounded focus:ring-green-500 focus:ring-offset-0"
                />
                <span className="text-sm text-zinc-300 select-none group-hover:text-green-400 transition-colors">
                  Lembrar-me
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={!isFormValid}
              className="w-full bg-green-500 hover:bg-green-600 text-zinc-900 font-semibold py-2.5 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-zinc-800"
            >
              Entrar
            </button>
          </form>

          <div className="relative flex items-center justify-center">
            <hr className="w-full border-zinc-700" />
            <span className="absolute px-3 bg-zinc-800/90 text-xs text-zinc-400">
              ou
            </span>
          </div>

          <button
            onClick={handleGoogleLogin}
            className="w-full bg-white border border-gray-300 text-gray-800 font-medium py-2.5 rounded-xl flex items-center justify-center gap-3 hover:bg-gray-100 transition-all duration-200 shadow-sm"
          >
            <img
              src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
              className="w-5 h-5"
              alt="Google"
            />
            Entrar com Google
          </button>
        </div>
      </div>
    </div>
  );
}
