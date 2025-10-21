// mcp_analysis_retriever.js — Servidor MCP para obtener análisis de cliente
import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();

// CORS completo para máxima compatibilidad.
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["*"],
  exposedHeaders: ["*"],
  credentials: false
}));

app.use(express.json());

// === CONFIGURACIÓN ===
// Apunta a tu nuevo script PHP en HostGator.
const ANALYSIS_API_URL = "https://www.vjparfumsonline.com/get_analysis_history.php?password=fsfs$16IgfgfewS";

// Función para obtener el análisis desde HostGator.
async function getAnalysis(clientId, analysisType) {
  try {
    const r = await fetch(ANALYSIS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id_cliente: clientId,
        tipo: analysisType
      })
    });
    
    // Si el script PHP devuelve 404, significa que no hay resultados, lo cual no es un error del servidor.
    if (r.status === 404) {
      const data = await r.json();
      return {
          type: "text",
          text: data.mensaje || "No se encontró ningún análisis para los criterios especificados."
      };
    }

    if (!r.ok) {
      const text = await r.text().catch(() => '');
      throw new Error(`API de análisis error ${r.status}: ${text}`);
    }
    
    const data = await r.json();
    return {
        type: "text",
        text: JSON.stringify(data.resultado, null, 2)
    };
  } catch (error) {
    throw new Error(`Error conectando con HostGator: ${error.message}`);
  }
}

// === DEFINICIÓN DE LA HERRAMIENTA ===
const TOOL_DEF = {
  name: "getLatestClientAnalysis",
  description: "Obtiene el último análisis guardado para un cliente específico y un tipo de análisis. Devuelve el análisis completo y su fecha de creación.",
  inputSchema: {
    type: "object",
    properties: {
      id_cliente: {
        type: "integer",
        description: "El ID numérico del cliente a consultar."
      },
      tipo: {
        type: "string",
        description: "El tipo de análisis a recuperar.",
        enum: ["evaluate_portfolio", "ticker_info", "replacement"]
      }
    },
    required: ["id_cliente", "tipo"]
  }
};

// === MANEJO DE MENSAJES JSON-RPC ===
// Esta sección es técnicamente idéntica a tu implementación original para asegurar compatibilidad.
async function handleJsonRpc(body) {
  const { jsonrpc, id, method, params } = body || {};
  
  console.log(`📨 Método MCP: ${method}`);

  if (method === "initialize") {
    return {
      jsonrpc: "2.0", id,
      result: {
        protocolVersion: "2024-11-05",
        serverInfo: { name: "mcp-analysis-retriever", version: "1.0.0" },
        capabilities: { tools: {} }
      }
    };
  }

  if (method === "tools/list") {
    return {
      jsonrpc: "2.0", id,
      result: { tools: [TOOL_DEF] }
    };
  }

  if (method === "tools/call") {
    const { name, arguments: args } = params || {};
    
    if (name !== "getLatestClientAnalysis") {
      return { jsonrpc: "2.0", id, error: { code: -32601, message: "Herramienta no encontrada" } };
    }

    const { id_cliente, tipo } = args || {};
    console.log(`🔍 Buscando análisis para cliente: ${id_cliente}, tipo: ${tipo}`);
    
    const resultado = await getAnalysis(id_cliente, tipo);
    console.log(`✅ Análisis obtenido exitosamente`);
    
    return {
      jsonrpc: "2.0", id,
      result: { content: [ resultado ] }
    };
  }

  if (method === "ping") {
    return { jsonrpc: "2.0", id, result: {} };
  }

  if (method === "notifications/list") {
    return { jsonrpc: "2.0", id, result: { notifications: [] } };
  }

  console.warn(`⚠️ Método no soportado: ${method}`);
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Método no soportado: ${method}` } };
}

// === ENDPOINT SSE CON JSON-RPC INTEGRADO ===
app.get("/", async (req, res) => {
  console.log("🔗 Agent Builder solicitando conexión SSE...");
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "X-Accel-Buffering": "no"
  });
  res.write(`: connected\n\n`);
  console.log("✅ SSE iniciado");
  const heartbeat = setInterval(() => { res.write(`: heartbeat ${Date.now()}\n\n`); }, 30000);
  req.on("close", () => { clearInterval(heartbeat); console.log("❌ SSE desconectado"); });
});

// === ENDPOINT POST PARA JSON-RPC ===
app.post("/", async (req, res) => {
  try {
    console.log("📬 POST recibido:", JSON.stringify(req.body).substring(0, 100));
    const response = await handleJsonRpc(req.body);
    console.log("📤 Respuesta enviada");
    res.json(response);
  } catch (error) {
    console.error("❌ Error:", error);
    res.status(500).json({
      jsonrpc: "2.0",
      id: req.body?.id || null,
      error: { code: -32000, message: error.message }
    });
  }
});

// === HEALTH CHECK ===
app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "ok", 
    service: "mcp-analysis-retriever",
    timestamp: new Date().toISOString()
  });
});

// === OPCIONES (CORS preflight) ===
app.options("*", (req, res) => {
  res.sendStatus(204);
});

// === INICIO DEL SERVIDOR ===
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Servidor MCP para Agent Builder activo en puerto ${PORT}`);
  console.log(`📍 Endpoint: http://0.0.0.0:${PORT}/`);
  console.log(`📍 Health: http://0.0.0.0:${PORT}/health`);
});
