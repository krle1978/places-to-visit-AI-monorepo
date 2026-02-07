function getProxyTarget() {
  const raw =
    process.env.API_URL ||
    process.env.PUBLIC_API_URL ||
    process.env.VITE_API_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "";
  const value = String(raw || "").trim();
  if (!value) return "";
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withProtocol.replace(/\/+$/, "");
}

function shouldDropHeader(name) {
  const key = String(name || "").toLowerCase();
  return (
    key === "host" ||
    key === "connection" ||
    key === "content-length" ||
    key === "accept-encoding" ||
    key === "x-forwarded-for" ||
    key === "x-forwarded-host" ||
    key === "x-forwarded-proto"
  );
}

async function readBody(req) {
  const method = String(req.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") return undefined;

  return await new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  const target = getProxyTarget();
  if (!target) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "API proxy target is not configured (set API_URL)." }));
    return;
  }

  const incomingUrl = String(req.url || "/");
  const proxyPath =
    incomingUrl === "/api" || incomingUrl === "/api/"
      ? "/"
      : incomingUrl.startsWith("/api/")
        ? incomingUrl
        : `/api${incomingUrl.startsWith("/") ? "" : "/"}${incomingUrl}`;

  const outUrl = new URL(proxyPath, target);

  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers || {})) {
    if (shouldDropHeader(name)) continue;
    if (Array.isArray(value)) {
      value.forEach((v) => {
        if (v != null) headers.append(name, String(v));
      });
    } else if (value != null) {
      headers.set(name, String(value));
    }
  }
  headers.set("accept-encoding", "identity");

  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    res.statusCode = 400;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Failed to read request body." }));
    return;
  }

  let response;
  try {
    response = await fetch(outUrl, {
      method: req.method,
      headers,
      body
    });
  } catch (err) {
    res.statusCode = 502;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Failed to reach upstream API." }));
    return;
  }

  res.statusCode = response.status;

  const dropResponseHeader = (name) => {
    const key = String(name || "").toLowerCase();
    return (
      key === "transfer-encoding" ||
      key === "connection" ||
      key === "content-length" ||
      key === "content-encoding"
    );
  };

  for (const [name, value] of response.headers) {
    if (dropResponseHeader(name)) continue;
    if (name.toLowerCase() === "set-cookie") continue;
    res.setHeader(name, value);
  }

  const setCookies = response.headers.getSetCookie?.();
  if (setCookies?.length) {
    res.setHeader("set-cookie", setCookies);
  }

  const buf = Buffer.from(await response.arrayBuffer());
  res.end(buf);
}
