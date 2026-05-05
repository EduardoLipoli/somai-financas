import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { auth } from "../firebase/config";

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      if (currentUser) {
        setUser({
          name: currentUser.displayName || currentUser.email.split("@")[0],
          email: currentUser.email,
          photoURL: currentUser.photoURL,
          initial: (currentUser.displayName || currentUser.email)
            .charAt(0)
            .toUpperCase(),
        });
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await auth.signOut();
    navigate("/");
  };

  const isActive = (path) => location.pathname === path;
  const closeMenu = () => setIsOpen(false);

  const baseLiClass =
    "flex items-center gap-4 p-4 w-full text-sm transition-colors whitespace-nowrap overflow-hidden";
  const activeClass =
    "bg-zinc-800/50 text-green-400 border-r-2 border-green-500";
  const inactiveClass = "text-zinc-400 hover:bg-zinc-700/50";

  return (
    <>
      {/* Botão Hambúrguer (Mobile) */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-4 left-4 z-[60] bg-green-500 p-2 rounded-lg text-zinc-900 shadow-lg"
      >
        <i className={`fas ${isOpen ? "fa-times" : "fa-bars"} text-xl`}></i>
      </button>

      {/* Backdrop (Mobile) */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[45] lg:hidden"
          onClick={closeMenu}
        ></div>
      )}

      {/* SIDEBAR CORRIGIDA */}
      <div
        className={`
        fixed inset-y-0 left-0 z-50 flex flex-col justify-between h-full bg-gradient-to-b from-[#18181b] to-[#27272a] border-r border-white/5 transition-all duration-300 group
        ${isOpen ? "w-64 translate-x-0" : "-translate-x-full lg:translate-x-0"} 
        lg:static lg:w-16 lg:hover:w-64 lg:shrink-0 overflow-hidden
      `}
      >
        <div>
          {/* Logo / Somaí */}
          <div className="p-4 mt-2 flex justify-center">
            <i className="fas fa-coins text-green-400 text-2xl animate-float"></i>
          </div>

          <ul className="mt-4 w-full flex flex-col gap-1">
            {[
              { path: "/dashboard", icon: "fa-chart-pie", label: "Dashboard" },
              {
                path: "/receitas",
                icon: "fa-wallet",
                label: "Carteira (Receitas)",
              },
              {
                path: "/despesas",
                icon: "fa-money-check-alt",
                label: "Despesas",
              },
              { path: "/metas", icon: "fa-flag", label: "Metas" },
              {
                path: "/configuracoes",
                icon: "fa-cog",
                label: "Configurações",
              },
            ].map((item) => (
              <Link key={item.path} to={item.path} onClick={closeMenu}>
                <li
                  className={`${baseLiClass} ${isActive(item.path) ? activeClass : inactiveClass}`}
                >
                  <i
                    className={`fas ${item.icon} text-lg w-5 text-center shrink-0`}
                  ></i>
                  {/* Texto do Link Corrigido */}
                  <span className="transition-opacity duration-300 delay-100 opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
                    {item.label}
                  </span>
                </li>
              </Link>
            ))}
          </ul>
        </div>

        {/* Perfil e Logout Corrigido */}
        <div className="p-4 border-t border-white/5 flex items-center gap-3 overflow-hidden">
          {user ? (
            <>
              <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center font-bold shrink-0 ring-2 ring-zinc-800">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt="Perfil"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-sm text-white">{user.initial}</span>
                )}
              </div>
              <div className="flex flex-col flex-1 transition-opacity duration-300 delay-100 whitespace-nowrap opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
                <p className="text-sm font-medium text-white truncate w-32">
                  {user.name}
                </p>
                <button
                  onClick={handleLogout}
                  className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 mt-1 transition-colors w-fit"
                >
                  <i className="bi bi-box-arrow-left"></i> Sair
                </button>
              </div>
            </>
          ) : (
            <div className="w-8 h-8 rounded-full bg-zinc-700 animate-pulse shrink-0"></div>
          )}
        </div>
      </div>
    </>
  );
}
