const VAST_BASE_URL = "https://cloud.vast.ai";

function vastHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${process.env.VAST_API_KEY}`,
    "Content-Type": "application/json",
  };
}

function instanceId(): string {
  const id = process.env.VAST_INSTANCE_ID;
  if (!id) throw new Error("VAST_INSTANCE_ID is not set");
  return id;
}

export async function startInstance() {
  const res = await fetch(
    `${VAST_BASE_URL}/api/v0/instances/${instanceId()}/`,
    {
      method: "PUT",
      headers: vastHeaders(),
      body: JSON.stringify({ state: "running" }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vast.ai start failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function stopInstance() {
  const res = await fetch(
    `${VAST_BASE_URL}/api/v0/instances/${instanceId()}/`,
    {
      method: "PUT",
      headers: vastHeaders(),
      body: JSON.stringify({ state: "stopped" }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vast.ai stop failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function getInstanceStatus() {
  const res = await fetch(
    `${VAST_BASE_URL}/api/v0/instances/${instanceId()}/`,
    {
      method: "GET",
      headers: vastHeaders(),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vast.ai status failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  // Vast.ai wraps single instance in { instances: { ... } }
  return data.instances ?? data;
}

export async function getBilling() {
  const res = await fetch(`${VAST_BASE_URL}/api/v0/users/current/`, {
    method: "GET",
    headers: vastHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vast.ai billing failed (${res.status}): ${text}`);
  }
  return res.json();
}
