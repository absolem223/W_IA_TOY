
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  console.log("=== STARTING DIRECT FORCED TOOL TEST ===");
  
  const payload = {
    model: "meta-llama/llama-3.2-3b-instruct:free", 
    messages: [
      { role: "user", content: "Ejecuta ping_tool obligatoriamente con el argumento echo='Hola Proxy!'" }
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "ping_tool",
          description: "Minimal diagnostic tool. Use this to verify that your tool calling pipeline is working.",
          parameters: {
            type: "object",
            properties: {
              echo: { type: "string" }
            },
            required: ["echo"],
            additionalProperties: false
          }
        }
      }
    ],
    tool_choice: { type: "function", function: { name: "ping_tool" } },
    stream: true
  };

  console.log(`-> Sending POST request to https://openrouter.ai/api/v1/chat/completions (Model: ${payload.model})`);
  
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error(`HTTP Error: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error("Response body:", text);
      return;
    }

    console.log("<- Received response stream. Reading chunks...\n");

    const decoder = new TextDecoder('utf-8');
    if (response.body) {
      // Node 24 fetch returns a Web ReadableStream, so we use getReader()
      const reader = response.body.getReader();
      let done = false;
      while (!done) {
        const { value, done: isDone } = await reader.read();
        done = isDone;
        if (value) {
          const text = decoder.decode(value, { stream: true });
          const lines = text.split('\n');
          for (const line of lines) {
            if (line.trim().startsWith('data: ') && !line.includes('[DONE]')) {
              try {
                const json = JSON.parse(line.slice(6));
                if (json.model) {
              console.log("[SSE] MODEL USED:", json.model);
            }
            if (json.choices?.[0]?.delta) {
                  const delta = json.choices[0].delta;
                  if (delta.tool_calls) {
                    console.log("[SSE] TOOL_CALL DELTA:", JSON.stringify(delta.tool_calls));
                  } else if (delta.content) {
                    console.log("[SSE] TEXT CONTENT:", JSON.stringify(delta.content));
                  }
                }
                if (json.choices?.[0]?.finish_reason) {
                  console.log("[SSE] FINISH_REASON:", json.choices[0].finish_reason);
                }
              } catch (e) {
                // Ignore parse errors on incomplete lines
              }
            }
          }
        }
      }
    }

    console.log("\n=== STREAM COMPLETED ===");

  } catch (err: any) {
    console.error("Fetch failed:", err.message);
  }
}

run();
