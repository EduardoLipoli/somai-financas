## 🚀 Como Executar o Projeto

1.  **Clone o repositório:**

    ```bash
    git clone [https://github.com/seu-usuario/somai-financas.git](https://github.com/seu-usuario/somai-financas.git)
    ```

2.  **Instale as dependências:**

    ```bash
    npm install
    ```

3.  **Configure o Firebase:**
    Crie um arquivo `.env` na raiz do projeto com suas credenciais:

    ```env
    VITE_FIREBASE_API_KEY=sua_chave
    VITE_FIREBASE_AUTH_DOMAIN=seu_dominio
    VITE_FIREBASE_PROJECT_ID=seu_id
    # ... demais chaves
    ```

4.  **Inicie o servidor de desenvolvimento:**
    ```bash
    npm run dev
    ```

## 👤 Autor

- **Eduardo Lipoli da Silva** – [Seu GitHub](https://github.com/seu-usuario)Um `README.md` bem estruturado é essencial para o portfólio da **Agência Vizyon** e para destacar suas habilidades como desenvolvedor Full Stack. Abaixo, preparei um modelo completo baseado em toda a estrutura e funcionalidades que implementamos no **Somaí Finanças**:[cite: 1]

---

# 🚀 Somaí Finanças

O **Somaí Finanças** (anteriormente Orbe Finance) é um painel financeiro inteligente desenvolvido para oferecer controle absoluto sobre receitas e despesas.[cite: 1, 4] A aplicação permite gerenciar transações avulsas, parceladas ou fixas, oferecendo uma visão clara do fluxo de caixa através de gráficos e resumos estratégicos.[cite: 1, 4]

## 🛠️ Tecnologias Utilizadas

- **React** (Vite): Framework para construção da interface.
- **Firebase**: Autenticação de usuários e banco de dados NoSQL (Cloud Firestore).[cite: 1, 2, 4]
- **Tailwind CSS**: Estilização responsiva e moderna.[cite: 1, 3, 5]
- **JavaScript (ES6+)**: Lógica de expansão de parcelas e cálculos financeiros.[cite: 1, 4]
- **FontAwesome & Bootstrap Icons**: Biblioteca de ícones.[cite: 1, 3, 5]

## ✨ Principais Funcionalidades

- **Dashboard Inteligente**: Resumo de receitas, despesas e sobra do mês, com filtros por período ou visão anual.[cite: 2, 4]
- **Gráfico de Evolução**: Visualização dos últimos 6 meses com barras customizadas que detalham gastos por categoria.[cite: 1]
- **Gestão de Transações**:
  - Criação de despesas/receitas fixas ou parceladas.[cite: 1, 4]
  - Sistema de _Overrides_: Possibilidade de editar o valor ou status de pagamento de apenas um mês específico sem afetar o histórico ou parcelas futuras.[cite: 1]
  - Histórico de alterações e notas personalizadas por transação.[cite: 1]
- **Sistema de Alertas**:
  - Pop-up de notificações para dívidas já atrasadas.[cite: 1]
  - Avisos de vencimento próximo (próximos 5 dias).[cite: 1]
- **Navegação Responsiva**: Sidebar adaptável com menu hambúrguer para dispositivos móveis e expansão por _hover_ no desktop.[cite: 5]
- **Exportação de Dados**: Geração de relatórios em formato CSV.[cite: 1]

## 📂 Estrutura do Projeto

```text
somai-financas/
├── public/              # Ativos estáticos (ícones, favicon)
├── src/
│   ├── assets/          # Imagens e recursos globais
│   ├── components/      # Componentes reutilizáveis (Sidebar, Form, Gráficos)
│   ├── firebase/        # Configuração e inicialização do Firebase
│   ├── pages/           # Telas principais (Dashboard, Despesas, Metas, etc.)
│   ├── utils/           # Funções auxiliares de formatação de moeda e datas
│   ├── App.jsx          # Gerenciamento de rotas
│   └── main.jsx         # Ponto de entrada do React
├── .gitignore           # Arquivos ignorados pelo Git
├── tailwind.config.js   # Configurações do Tailwind
└── vite.config.js       # Configurações de build do Vite
```
