const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { detectAgent } = require("./agents/router");
const { getAgentPrompt } = require("./agents/prompts");
const { generateText } = require("./agents/provider");
const { validateConversation, CONVERSATION_PROMPT } = require("./agents/conversation");

const { webDevelopmentIntent } = require('./agents/webDevelopmentIntent');
const { groundedReply, handoffReply, language, isGeneric } = require('./agents/grounding');
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    status: "online",
    service: "OneLeadQ AI Agent",
    stage: 11,
    provider: "Gemini",
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    message: "OneLeadQ AI Agent is running",
    provider: "Gemini",
  });
});

// Stage 16: opt-in authenticated Web Development specialist workflow.
require("./webDevelopment/routes").mountWebDevelopment(app);

app.post("/ai", async (req, res) => {
  let layer = "validation";
  try {
    const { message, clientContext, history } = validateConversation(req.body || {});
    if (!message) {
      return res.status(400).json({
        ok: false,
        error: "Message is required",
      });
    }

    layer = "routing";
    // 1. Select specialist agent
    const selectedAgent = detectAgent(message, history);

    console.log(
      `ROUTER: ${selectedAgent.name} | Score: ${selectedAgent.score}`
    );

    // 2. Load specialist prompt
    const systemPrompt = getAgentPrompt(selectedAgent.id);

    const handoff=webDevelopmentIntent(message,history);
    if(handoff)return res.json({ok:true,agentId:'webDevelopment',agent:selectedAgent.name,reply:handoffReply(message,clientContext,history),handoff:{kind:'web-development',...handoff,clientId:clientContext?.id||null},privilegedAction:false});
    layer = "grounding";
    const grounded=groundedReply(message,clientContext,history);
    if(grounded)return res.json({ok:true,agentId:selectedAgent.id,agent:selectedAgent.name,grounded:true,reply:grounded});
    // General educational chat has no client facts or prior generated claims in
    // its provider prompt. Client-specific answers above cannot hallucinate new
    // business claims, irrespective of the provider's output.
    const clientInfo='GENERAL CONVERSATION ONLY. No client facts are provided. Never personalize examples or imply they are verified client offerings.';
    const providerHistory=clientContext?history.filter(t=>t.role==='user' && isGeneric(t.content) && !(clientContext.name && t.content.toLowerCase().includes(clientContext.name.toLowerCase()))):history;

const contents = `${CONVERSATION_PROMPT}

${systemPrompt}

${clientInfo}

RECENT CONVERSATION DATA:
${JSON.stringify(providerHistory)}

USER REQUEST:
${message}`;

    layer = "provider";
    // 3. Gemini + retry + fallback
    const { response, model } =
      await generateText(contents);

    layer = "response";
    // 4. Return final result
    let reply=response.text;
    if(clientContext){if((clientContext.name && String(reply).toLowerCase().includes(clientContext.name.toLowerCase())) || /your (business|company|client)|this client|client offers|\u0b89\u0b99\u0bcd\u0b95\u0bb3\u0bcd \u0ba8\u0bbf\u0bb1\u0bc1\u0bb5\u0ba9\u0bae\u0bcd|\u0bb5\u0bbe\u0b9f\u0bbf\u0b95\u0bcd\u0b95\u0bc8\u0baf\u0bbe\u0bb3\u0bb0\u0bbf\u0ba9\u0bcd|avanga|ivanga/i.test(String(reply)))reply=groundedReply('client details',clientContext,history);else reply=(language(message,history)==='ta'?'பொதுவான தகவல்; வாடிக்கையாளர் பற்றிய உறுதிப்படுத்தப்பட்ட தகவல் அல்ல.\n':language(message,history)==='tanglish'?'General information; idhu verified client facts illa.\n':'General information, not verified client facts.\n')+reply;}
    res.json({
      ok: true,
      provider: "Gemini",
      model,
      agent: selectedAgent.name,
      agentId: selectedAgent.id,
      reply,
    });
  } catch (error) {
    const invalid = layer === 'validation' && error.status === 400;
    console.error("AI request failed", { layer, status: invalid ? 400 : 503,
      upstreamStatus: layer === 'provider' && Number.isInteger(error.status) ? error.status : undefined,
      reason: invalid && /^AI_VALIDATION_[A-Z_0-9]+$/.test(error.code || '') ? error.code : 'AI_' + layer.toUpperCase() + '_FAILED' });

    res.status(invalid ? 400 : 503).json({
      ok: false,
      provider: "Gemini",
      error: invalid ? "Invalid AI request. Check client details and conversation, then try again." : "AI service temporarily unavailable",
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("--------------------------------");
  console.log("OneLeadQ AI Agent ONLINE");
  console.log(`Port: ${PORT}`);
  console.log("AI Provider: Gemini");
  console.log("Retry + Model Fallback: ENABLED");
  console.log("AI endpoint: POST /ai");
  console.log("--------------------------------");
});
