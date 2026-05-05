import React, { useMemo } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";
import ChartDataLabels from "chartjs-plugin-datalabels";

// Registra os elementos do Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  ChartDataLabels,
);

export default function DashboardCharts({
  transactions,
  currentMonth,
  currentYear,
}) {
  // 1. Processamento de Dados usando useMemo
  const chartData = useMemo(() => {
    // Arrays para os meses do ano todo
    const monthlyIncome = Array(12).fill(0);
    const monthlyExpense = Array(12).fill(0);

    // Filtros para o mês atual
    const categoriesMap = {};
    let paidCount = 0;
    let pendingCount = 0;
    let day01 = 0;
    let day15 = 0;

    // Processa Transações (Verifica se transactions existe para evitar o erro de 'undefined')
    if (transactions && Array.isArray(transactions)) {
      transactions.forEach((t) => {
        // Como os dados já vêm expandidos e com dueDate formatado do Dashboard,
        // usamos a lógica de data segura.
        const d = new Date(t.dueDate);
        const isCurrentYear = d.getFullYear() === currentYear;
        const isCurrentMonth = d.getMonth() === currentMonth && isCurrentYear;
        const amount = Number(t.amount) || 0;

        // Gráficos Anuais (Meses)
        if (isCurrentYear) {
          if (t.type === "Ganho") monthlyIncome[d.getMonth()] += amount;
          if (t.type === "Gasto") monthlyExpense[d.getMonth()] += amount;
        }

        // Gráficos do Mês Específico
        if (isCurrentMonth && t.type === "Gasto") {
          // Categorias (Já vêm com o nome formatado do Dashboard)
          const cat = t.category || "Sem Categoria";
          categoriesMap[cat] = (categoriesMap[cat] || 0) + amount;

          // Pagas vs Pendentes
          if (t.isPaid) paidCount++;
          else pendingCount++;

          // Dia 01 vs 15
          if (t.datepay === "01") day01 += amount;
          if (t.datepay === "15") day15 += amount;
        }
      });
    }

    return {
      monthlyIncome,
      monthlyExpense,
      categoriesMap,
      paidCount,
      pendingCount,
      day01,
      day15,
    };
  }, [transactions, currentMonth, currentYear]);

  // 2. Configurações Globais dos Gráficos
  const optionsBar = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, datalabels: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: "#a1a1aa" } },
      y: {
        grid: { color: "rgba(255,255,255,0.05)" },
        ticks: { color: "#a1a1aa" },
      },
    },
  };

  const optionsDoughnut = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "top", labels: { color: "#a1a1aa" } },
      datalabels: {
        color: "#fff",
        font: { weight: "bold" },
        formatter: (value) => (value > 0 ? value : ""),
      },
    },
    cutout: "70%",
    borderWidth: 0,
  };

  return (
    <>
      {/* Gráficos Mensais de Entrada e Saída */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 mb-6">
        <div className="bg-zinc-800/50 rounded-xl p-4 md:p-5 h-80 border border-white/5">
          <h2 className="text-lg font-semibold text-zinc-300 mb-4">
            <i className="bi bi-graph-up-arrow text-green-400 mr-2"></i>{" "}
            Receitas por Mês
          </h2>
          <div className="h-56">
            <Bar
              data={{
                labels: [
                  "Jan",
                  "Fev",
                  "Mar",
                  "Abr",
                  "Mai",
                  "Jun",
                  "Jul",
                  "Ago",
                  "Set",
                  "Out",
                  "Nov",
                  "Dez",
                ],
                datasets: [
                  {
                    data: chartData.monthlyIncome,
                    backgroundColor: "#22c55e",
                    borderRadius: 4,
                  },
                ],
              }}
              options={optionsBar}
            />
          </div>
        </div>
        <div className="bg-zinc-800/50 rounded-xl p-4 md:p-5 h-80 border border-white/5">
          <h2 className="text-lg font-semibold text-zinc-300 mb-4">
            <i className="bi bi-graph-down-arrow text-red-400 mr-2"></i>{" "}
            Despesas por Mês
          </h2>
          <div className="h-56">
            <Bar
              data={{
                labels: [
                  "Jan",
                  "Fev",
                  "Mar",
                  "Abr",
                  "Mai",
                  "Jun",
                  "Jul",
                  "Ago",
                  "Set",
                  "Out",
                  "Nov",
                  "Dez",
                ],
                datasets: [
                  {
                    data: chartData.monthlyExpense,
                    backgroundColor: "#ef4444",
                    borderRadius: 4,
                  },
                ],
              }}
              options={optionsBar}
            />
          </div>
        </div>
      </div>

      {/* Gráficos de Divisão (Categorias e Status) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
        <div className="bg-zinc-800/50 rounded-xl p-4 md:p-5 h-80 border border-white/5">
          <h2 className="text-lg font-semibold text-zinc-300 mb-4">
            <i className="bi bi-tags text-yellow-400 mr-2"></i> Por Categoria
          </h2>
          <div className="h-56">
            <Bar
              options={{ ...optionsBar, indexAxis: "y" }}
              data={{
                labels: Object.keys(chartData.categoriesMap),
                datasets: [
                  {
                    data: Object.values(chartData.categoriesMap),
                    backgroundColor: [
                      "#3b82f6",
                      "#facc15",
                      "#a855f7",
                      "#ec4899",
                      "#14b8a6",
                    ],
                    borderRadius: 4,
                  },
                ],
              }}
            />
          </div>
        </div>

        <div className="bg-zinc-800/50 rounded-xl p-4 md:p-5 h-80 border border-white/5">
          <h2 className="text-lg font-semibold text-zinc-300 mb-4">
            <i className="bi bi-check2-circle text-green-400 mr-2"></i> Pagas vs
            Pendentes
          </h2>
          <div className="h-56 relative">
            <Doughnut
              data={{
                labels: ["Pagas", "Pendentes"],
                datasets: [
                  {
                    data: [chartData.paidCount, chartData.pendingCount],
                    backgroundColor: ["#22c55e", "#ef4444"],
                  },
                ],
              }}
              options={optionsDoughnut}
            />
          </div>
        </div>

        <div className="bg-zinc-800/50 rounded-xl p-4 md:p-5 h-80 border border-white/5">
          <h2 className="text-lg font-semibold text-zinc-300 mb-4">
            <i className="bi bi-calendar-event text-blue-400 mr-2"></i>{" "}
            Vencimentos (01 vs 15)
          </h2>
          <div className="h-56 relative">
            <Doughnut
              data={{
                labels: ["Dia 01", "Dia 15"],
                datasets: [
                  {
                    data: [chartData.day01, chartData.day15],
                    backgroundColor: ["#3b82f6", "#facc15"],
                  },
                ],
              }}
              options={optionsDoughnut}
            />
          </div>
        </div>
      </div>
    </>
  );
}
