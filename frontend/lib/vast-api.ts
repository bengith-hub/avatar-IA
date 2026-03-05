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

/**
 * Extract the public worker URL from a Vast.ai instance object.
 * Vast.ai maps internal port 8000 to a random public port on the instance IP.
 */
export function extractWorkerUrl(instance: Record<string, unknown>): string | null {
  const status =
    (instance.actual_status as string) ??
    (instance.intended_status as string) ??
    (instance.cur_state as string);
  if (status !== "running") return null;

  const ip =
    (instance.public_ipaddr as string) ??
    (instance.ssh_host as string);
  if (!ip) return null;

  // Vast.ai stores port mappings in `ports` as { "8000/tcp": [{ HostPort: "XXXXX" }] }
  const ports = instance.ports as
    | Record<string, Array<{ HostPort?: string }>>
    | undefined;

  if (ports) {
    const entry = ports["8000/tcp"];
    if (entry && entry.length > 0 && entry[0].HostPort) {
      return `http://${ip}:${entry[0].HostPort}`;
    }
  }

  // Fallback: direct_port_start for direct-mapped instances
  const directPort = instance.direct_port_start as number | undefined;
  if (directPort) {
    return `http://${ip}:${directPort}`;
  }

  // Last fallback: try port 8000 directly
  return `http://${ip}:8000`;
}

/**
 * Fetch instance data and extract the worker URL.
 */
export async function getWorkerUrlFromInstance(): Promise<string | null> {
  try {
    const instance = await getInstanceStatus();
    return extractWorkerUrl(instance);
  } catch {
    return null;
  }
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
