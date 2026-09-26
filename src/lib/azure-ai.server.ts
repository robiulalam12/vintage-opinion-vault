const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Calls the user's Azure OpenAI deployment (chat completions), streaming the reply
 * and collecting it server-side. Retries only 429/5xx with bounded backoff.
 */
export async function azureChat(system: string, user: string, json = true): Promise<string> {
  const endpointRaw = process.env["AZURE_OPENAI_ENDPOINT"];
  const key = process.env["AZURE_OPENAI_API_KEY"];
  const deployment = process.env["AZURE_OPENAI_DEPLOYMENT"];
  if (!endpointRaw || !key || !deployment) {
    throw new Error("Azure OpenAI is not set up yet — add the endpoint, API key and deployment name.");
  }

  // Accept either a bare resource URL or a full chat-completions URL.
  let url: string;
  if (endpointRaw.includes("/chat/completions")) {
    url = endpointRaw;
  } else {
    const base = endpointRaw.replace(/\/+$/, "").replace(/\/openai(\/v1)?$/, "");
    url = `${base}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=2024-10-21`;
  }

  const body = {
    model: deployment,
    stream: true,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    ...(json ? { response_format: { type: "json_object" } } : {}),
  };

  let lastError = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": key },
      body: JSON.stringify(body),
    });

    if (res.status === 429 || res.status >= 500) {
      lastError = `Azure is busy (${res.status}).`;
      const ra = Number(res.headers.get("retry-after"));
      await res.body?.cancel();
      await sleep((Number.isFinite(ra) && ra > 0 ? ra * 1000 : 2000 * 2 ** attempt) + Math.random() * 1000);
      continue;
    }
    if (!res.ok || !res.body) {
      const text = await res.text();
      throw new Error(`Azure returned ${res.status}: ${text.slice(0, 300)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let out = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const chunk = JSON.parse(payload);
          const delta = chunk.choices?.[0]?.delta?.content;
          if (typeof delta === "string") out += delta;
          if (chunk.choices?.[0]?.finish_reason === "content_filter") {
            throw new Error("Azure's content filter blocked this review.");
          }
        } catch (e) {
          if ((e as Error).message.includes("content filter")) throw e;
        }
      }
    }
    if (!out.trim()) throw new Error("Azure returned an empty reply.");
    return out;
  }
  throw new Error(lastError || "Azure request failed.");
}
