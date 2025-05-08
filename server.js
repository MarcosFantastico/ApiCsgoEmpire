// server.js
const express = require("express");
const oracledb = require("oracledb");
const cors = require("cors");
const say = require("say");
const { analisarItemCSGOEmpire } = require("./src/analisarItem");
const { calcularCustoBeneficio } = require("./src/analisarItem");
const { calcularPrecoMaximo } = require("./src/analisarItem");
require("dotenv").config({ path: 'credentials.env' });
const app = express();
app.use(express.json());
app.use(cors());
const TelegramBot = require('node-telegram-bot-api');

// Chat ID
const chatId = '5175130296';
// Cria o bot
const bot = new TelegramBot(process.env.telegranBotToken, {polling: true});

app.get('/analisar', async (req, res) => {
  const url = req.query.url;

  if (!url) {
    return res.status(400).json({ erro: 'Parâmetro "url" é obrigatório.' });
  }
  try {
    const resultado = await analisarItemCSGOEmpire(url);
    res.json(resultado);
  } catch (erro) {
    console.error('❌ Erro na análise do item:', erro);
    res.status(500).json({ erro: 'Erro ao analisar o item.' });
  }
});

app.get('/truncaHistorico', async (req, res) => {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    const sql = `TRUNCATE TABLE melhor_historico_empire`;
    await connection.execute(sql);
    await connection.commit(); // <- Faz o commit explícito

    bot.sendMessage(chatId, `✅ *Histórico Deletado!*`, { parse_mode: 'Markdown' });
    res.send('✅ Histórico truncado e commitado com sucesso.'); //retorna no navegador

  } catch (err) {
    console.error("❌ Erro ao truncar histórico:", err);
    res.status(500).send('❌ Erro ao truncar histórico.');
  } finally {
    if (connection) await connection.close();
  }
});


const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectString: process.env.DB_CONNECT_STRING
};

async function testConnection() {
  let conn;
  try {
    conn = await oracledb.getConnection(dbConfig);
    console.log("✅ Conexão OK!");
    const result = await conn.execute("SELECT SYSDATE FROM DUAL");
    console.log("Data do Oracle:", result.rows[0][0]);
  } catch (err) {
    console.error("❌ Erro:", err);
    process.exit(1);
  } finally {
    if (conn) await conn.close();
  }
}
testConnection();
const options = {
  method: "GET",
  headers: {
    accept: "application/json",
    Authorization: `Bearer ${process.env.EMPIRE_TOKEN}`,
  },
};

let itensBanco = [];
let itensEmpire = [];

async function fetchItensBanco() {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    const sql = `
      SELECT a.nome || ' | ' || s.nome AS "Arma | Skin"
      FROM arma a
      INNER JOIN skin s ON a.id = s.arma_id
      ORDER BY a.nome ASC, s.nome ASC
    `;
    const result = await connection.execute(sql);
    itensBanco = result.rows.map((row) => row[0]);
    //console.log("✅ Itens do Banco foram carregados!");
    //console.log(itensBanco)
  } catch (err) {
    console.error("❌ Erro ao buscar itens do banco:", err);
  } finally {
    if (connection) await connection.close();
  }
}

async function fetchItensEmpire() {
  try {
    const res = await fetch(
      "https://csgoempire.com/api/v2/trading/items?per_page=600&page=1&auction=yes&price_min=200&price_max=10000",
      options
    );
    const data = await res.json();
    const coin = 0.6142808;
    itensEmpire = data.data.map((item) => ({
      id: item.id,
      nome: item.market_name.substr([0],item.market_name.search(`\\(`)-1).toString(),
      float: item.wear,
      qualidade: item.wear_name,
      valor_mercado: (Number(item.market_value) / 100) * coin,
      lance_atual: (Number(item.purchase_price) / 100) * coin,
      preco_sugerido: (Number(item.suggested_price) / 100) * coin,
      desconto_overpay: item.above_recommended_price,
    }));
    //console.log("✅ Itens do Empire foram carregados!");
  } catch (err) {
    console.error("❌ Erro ao buscar itens do Empire:", err);
    return null;
  }
}


let ids_percorridos = [];
let i;


async function compararItens() {

  //console.log("\n🔎 Comparando itens do banco com os do Empire...");
  const normalize = str => str.normalize("NFD").replace(/[^\w\s|]/g, "").toLowerCase();

  for (const itemBanco of itensBanco) {
    const matches = itensEmpire.filter(itemEmpire =>
      normalize(itemEmpire.nome) === normalize(itemBanco)
    );
  
    for (const match of matches) {
      if (!match.float || ids_percorridos.includes(match.id)) {
        console.log(`item ${match.id} ja percorrido`);
        continue;
      }
  
      ids_percorridos.push(match.id);
      console.log(`id ${match.id} adicionado ao array e nao deve ser mais percorrido!`);
      console.log(`\n🎯 Item Encontrado: ${match.nome}`);
      console.log(`Float: ${match.float}`);
      console.log(`Qualidade: ${match.qualidade}`);
      console.log(`Valor de Mercado: $${match.valor_mercado.toFixed(2)}`);
      console.log(`Lance atual: $${match.lance_atual.toFixed(2)}`);
      console.log(`Preço Sugerido: $${match.preco_sugerido.toFixed(2)}`);
      console.log(`Desconto / Overpay: ${match.desconto_overpay}%`);
      const url = `https://csgoempire.com/item/${match.id}`;
      console.log("🔗 URL do Item:", url);
  
      const conn = await oracledb.getConnection({
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        connectString: process.env.DB_CONNECT_STRING
      });
  
      const checkExistingQuery = await conn.execute(
        `SELECT 
            mhe.id, 
            mhe.preco,
            mhe.skin_float,
            ar.nome || ' | ' || sk.nome as nome_completo,
            mhe.qualidade,
            mhe.data_registro,
            mhe.cb
          FROM 
            melhor_historico_empire mhe 
            JOIN skin sk ON sk.id = mhe.skin_id 
            JOIN arma ar ON ar.id = mhe.arma_id
          WHERE LOWER(qualidade) = LOWER(:qualidade)
            AND lower(ar.nome || ' | ' || sk.nome) LIKE lower(:nome)`,
        {
          nome: match.nome,
          qualidade: match.qualidade
        },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
  
      const row = checkExistingQuery.rows?.[0];
      const melhorItem = row ? {
        precoUSD: row.PRECO,
        float: row.SKIN_FLOAT,
        custoBeneficio: row.CB
      } : null;
  
      const precoMaximo_t = melhorItem
        ? +calcularPrecoMaximo(melhorItem.custoBeneficio, match.float).toFixed(2)
        : null;
      const diferencaPreco_t = melhorItem
        ? +(precoMaximo_t - match.lance_atual).toFixed(2)
        : null;
  
      let resultado = null;
      if (melhorItem) {
        console.log("Match Banco:");
        resultado = {
          precoAtual: match.lance_atual,
          floatAtual: match.float,
          custoBeneficioAtual: Number(calcularCustoBeneficio(match.lance_atual, match.float)),
          melhorItem: {
            precoUSD: melhorItem.precoUSD,
            float: melhorItem.float,
            custoBeneficio: Number(calcularCustoBeneficio(melhorItem.precoUSD, melhorItem.float))
          },
          precoMaximo: precoMaximo_t,
          diferencaPreco: diferencaPreco_t
        };
      } else {
        resultado = await analisarItemCSGOEmpire(url);
      }
  
      if (resultado?.precoAtual !== undefined && resultado?.melhorItem) {
        console.log(`\n📊 Resultado da Análise: ${match.nome} (${match.qualidade})`);
        console.log(`Preço lance leilão: $${resultado.precoAtual.toFixed(2)} | Float: ${resultado.floatAtual.toFixed(3)} | CB: ${resultado.custoBeneficioAtual.toFixed(2)}`);
        console.log(`Preço Melhor histórico: $${resultado.melhorItem.precoUSD.toFixed(2)} | Float ${resultado.melhorItem.float.toFixed(3)} | CB: ${resultado.melhorItem.custoBeneficio.toFixed(2)}`);
  
        const alertaCB = `Preço Máximo aceitável: $${resultado.precoMaximo.toFixed(2)} para o CB ${resultado.melhorItem.custoBeneficio.toFixed(2)} (${resultado.diferencaPreco.toFixed(2)} vs atual)`;
  
        if (resultado.precoMaximo < match.lance_atual) {
          console.log(`\x1b[31m${alertaCB}\x1b[0m`);
        } else {
          console.log(`\x1b[32m${alertaCB}\x1b[0m`);
          await bot.sendMessage(chatId,
  `🚨 *ITEM ENCONTRADO!* 🚨
  *${match.nome} (${match.qualidade})*
  
  *🔷 ATUAL*
  💰Preço: $${resultado.precoAtual.toFixed(2)}
  🎚️Float: ${resultado.floatAtual.toFixed(3)}
  📊CB: ${resultado.custoBeneficioAtual.toFixed(2)}
  
  *🔷 MELHOR*
  💰 Preço: $${resultado.melhorItem.precoUSD.toFixed(2)}
  🎚️ Float: ${resultado.melhorItem.float.toFixed(3)}
  📊 CB: ${resultado.melhorItem.custoBeneficio.toFixed(2)}
  
  ✅ *Preço Máximo:* $${resultado.precoMaximo.toFixed(2)}
  📌 *Diferença:* ${resultado.diferencaPreco.toFixed(2)}
  
  🔗 ${url}`,
            { parse_mode: 'Markdown' }
          );
        }
      } else {
        console.log("⚠️ Nenhum item histórico encontrado.");
      }
  
      await conn.close();
    }
  }
  


}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
async function executarProcesso() {
  while(true) {
    await fetchItensBanco();
    await fetchItensEmpire();
    await compararItens();
    await delay(3000);
  }
}
executarProcesso();
app.listen(3000, () => console.log("🚀 Servidor rodando na porta 3000"));