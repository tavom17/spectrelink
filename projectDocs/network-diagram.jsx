import { useState } from "react";

const COLORS = {
  bg: "#0A0F1E",
  panel: "#0F172A",
  border: "#1E293B",
  accent: "#00D4FF",
  green: "#00FF88",
  orange: "#FF6B35",
  purple: "#A855F7",
  yellow: "#FBBF24",
  text: "#CBD5E1",
  textDim: "#475569",
  textBright: "#E2E8F0",
};

const layers = [
  {
    id: "internet",
    label: "INTERNET",
    sublabel: "User Browser → spectrelink.org (HTTPS:443)",
    color: COLORS.textDim,
    bg: "#0F172A",
    borderColor: "#334155",
    icon: "🌐",
  },
  {
    id: "cf-edge",
    label: "CLOUDFLARE EDGE",
    sublabel: "DDoS Protection · SSL Termination · IP Masking · Miami PoP",
    color: COLORS.orange,
    bg: "#1C0A00",
    borderColor: COLORS.orange,
    icon: "☁",
    tag: "mia01 · mia02 · mia05 · mia08 · mia09",
    tagColor: "#FF6B3566",
  },
  {
    id: "tunnel",
    label: "CLOUDFLARE TUNNEL",
    sublabel: "Outbound QUIC · No port forwarding · Dynamic IP handled",
    color: "#F59E0B",
    bg: "#1C1000",
    borderColor: "#F59E0B",
    icon: "⟷",
    tag: "cloudflared:latest · 4 connections · tunnelID: 5da6751d",
    tagColor: "#F59E0B44",
  },
];

const networks = [
  {
    id: "public",
    label: "spectrelink_public",
    color: COLORS.orange,
    containers: [
      { name: "cf-tunnel", image: "cloudflare/cloudflared:latest", status: "running", note: "Reads /etc/cloudflared via bind mount" },
      { name: "nginx", image: "nginx:alpine", status: "running", note: "Reverse proxy · port 80/tcp" },
    ],
  },
  {
    id: "app",
    label: "spectrelink_app",
    color: COLORS.accent,
    containers: [
      { name: "nginx", image: "nginx:alpine", status: "running", note: "Also on public network" },
      { name: "frontend", image: "node:20-alpine", status: "placeholder", note: "Next.js — Phase 4" },
      { name: "api-gateway", image: "node:20-alpine", status: "placeholder", note: "Fastify + JWT — Phase 3" },
      { name: "wallet-app", image: "node:20-alpine", status: "placeholder", note: "HD Wallets — Phase 3" },
      { name: "launcher-app", image: "node:20-alpine", status: "placeholder", note: "SPL Tokens — Phase 3" },
      { name: "liquidity-app", image: "node:20-alpine", status: "placeholder", note: "Meteora — Phase 3" },
    ],
  },
  {
    id: "data",
    label: "spectrelink_data",
    color: COLORS.green,
    containers: [
      { name: "api-gateway", image: "node:20-alpine", status: "bridge", note: "ONLY bridge to app network" },
      { name: "postgres", image: "postgres:16-alpine", status: "running", note: "scrippa_admin / spectrelink · bind mount" },
      { name: "redis", image: "redis:7-alpine", status: "running", note: "Cache · Sessions · PubSub · Queues · bind mount" },
    ],
  },
];

const statusColors = {
  running: COLORS.green,
  placeholder: COLORS.textDim,
  bridge: COLORS.accent,
};

const statusLabels = {
  running: "● RUNNING",
  placeholder: "○ PLACEHOLDER",
  bridge: "◈ BRIDGE",
};

export default function NetworkDiagram() {
  const [hovered, setHovered] = useState(null);

  return (
    <div style={{
      background: COLORS.bg,
      minHeight: "100vh",
      fontFamily: "'Courier New', monospace",
      color: COLORS.text,
      padding: "32px 24px",
    }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{ fontSize: 28, fontWeight: "bold", color: COLORS.accent, letterSpacing: 6 }}>
          SPECTRELINK
        </div>
        <div style={{ fontSize: 12, color: COLORS.textDim, letterSpacing: 4, marginTop: 4 }}>
          NETWORK ARCHITECTURE · PHASES 1 & 2
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        {/* Top 3 layers */}
        {layers.map((layer, i) => (
          <div key={layer.id} style={{ marginBottom: 4 }}>
            <div style={{
              border: `1px solid ${layer.borderColor}`,
              borderRadius: 6,
              background: layer.bg,
              padding: "14px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 18 }}>{layer.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: "bold", color: layer.color, letterSpacing: 2 }}>
                    {layer.label}
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>
                    {layer.sublabel}
                  </div>
                </div>
              </div>
              {layer.tag && (
                <div style={{
                  fontSize: 10,
                  color: layer.color,
                  background: layer.tagColor,
                  border: `1px solid ${layer.borderColor}`,
                  borderRadius: 4,
                  padding: "4px 8px",
                  maxWidth: 240,
                  textAlign: "right",
                }}>
                  {layer.tag}
                </div>
              )}
            </div>
            {/* Arrow */}
            <div style={{ textAlign: "center", color: COLORS.textDim, fontSize: 16, lineHeight: "20px" }}>↓</div>
          </div>
        ))}

        {/* Docker Host Box */}
        <div style={{
          border: `2px solid #334155`,
          borderRadius: 10,
          padding: "20px",
          background: "#0B1120",
          marginTop: 8,
        }}>
          <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>🐳</span>
            <div>
              <span style={{ fontSize: 13, fontWeight: "bold", color: COLORS.textBright, letterSpacing: 2 }}>
                DOCKER HOST — GEEKOM A8 · UBUNTU SERVER
              </span>
              <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 2 }}>
                docker-compose.yml · /home/scrippa/spectrelink/
              </div>
            </div>
          </div>

          {networks.map((net, ni) => (
            <div key={net.id} style={{ marginBottom: ni < networks.length - 1 ? 16 : 0 }}>
              {/* Network label */}
              <div style={{
                fontSize: 10,
                fontWeight: "bold",
                color: net.color,
                letterSpacing: 3,
                marginBottom: 8,
                padding: "4px 10px",
                background: `${net.color}15`,
                border: `1px solid ${net.color}44`,
                borderRadius: 4,
                display: "inline-block",
              }}>
                {net.label}
              </div>

              {/* Containers grid */}
              <div style={{
                border: `1px solid ${net.color}33`,
                borderRadius: 6,
                padding: "12px",
                background: `${net.color}08`,
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
              }}>
                {net.containers.map((c) => (
                  <div
                    key={`${net.id}-${c.name}`}
                    onMouseEnter={() => setHovered(`${net.id}-${c.name}`)}
                    onMouseLeave={() => setHovered(null)}
                    style={{
                      border: `1px solid ${hovered === `${net.id}-${c.name}` ? net.color : "#1E293B"}`,
                      borderRadius: 5,
                      padding: "8px 12px",
                      background: hovered === `${net.id}-${c.name}` ? `${net.color}18` : "#0F172A",
                      minWidth: 180,
                      flex: "1 1 180px",
                      cursor: "default",
                      transition: "all 0.15s",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: "bold", color: COLORS.textBright }}>
                      {c.name}
                    </div>
                    <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 2 }}>
                      {c.image}
                    </div>
                    <div style={{ fontSize: 9, color: statusColors[c.status], marginTop: 4, letterSpacing: 1 }}>
                      {statusLabels[c.status]}
                    </div>
                    <div style={{ fontSize: 9, color: COLORS.textDim, marginTop: 3 }}>
                      {c.note}
                    </div>
                  </div>
                ))}
              </div>

              {/* Arrow between networks */}
              {ni < networks.length - 1 && (
                <div style={{ textAlign: "center", color: COLORS.textDim, fontSize: 12, lineHeight: "20px", marginTop: 4 }}>
                  ↕ api-gateway bridges {net.label.split('_')[1]} ↔ {networks[ni+1].label.split('_')[1]}
                </div>
              )}
            </div>
          ))}

          {/* Bind mounts */}
          <div style={{
            marginTop: 16,
            borderTop: "1px solid #1E293B",
            paddingTop: 12,
          }}>
            <div style={{ fontSize: 10, color: COLORS.textDim, letterSpacing: 2, marginBottom: 8 }}>
              BIND MOUNTS — HOST FILESYSTEM
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {[
                { service: "postgres", host: "/home/scrippa/server-data/postgres", container: "/var/lib/postgresql/data" },
                { service: "redis", host: "/home/scrippa/server-data/redis", container: "/data" },
                { service: "cloudflared", host: "/etc/cloudflared", container: "/etc/cloudflared" },
              ].map(m => (
                <div key={m.service} style={{
                  fontSize: 10,
                  border: "1px solid #1E293B",
                  borderRadius: 4,
                  padding: "6px 10px",
                  background: "#0A0F1E",
                  flex: "1 1 200px",
                }}>
                  <span style={{ color: COLORS.green }}>{m.service}</span>
                  <div style={{ color: COLORS.textDim, marginTop: 2 }}>
                    <span style={{ color: COLORS.accent }}>{m.host}</span>
                    <span style={{ color: COLORS.textDim }}> → </span>
                    <span style={{ color: COLORS.textBright }}>{m.container}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div style={{
          marginTop: 20,
          display: "flex",
          gap: 20,
          flexWrap: "wrap",
          justifyContent: "center",
          fontSize: 10,
          color: COLORS.textDim,
        }}>
          {[
            { color: COLORS.green, label: "● Running" },
            { color: COLORS.textDim, label: "○ Placeholder (Phase 3/4)" },
            { color: COLORS.accent, label: "◈ Bridge container" },
            { color: COLORS.orange, label: "▪ Public network" },
            { color: COLORS.accent, label: "▪ App network" },
            { color: COLORS.green, label: "▪ Data network" },
          ].map(l => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ color: l.color }}>■</span>
              <span>{l.label}</span>
            </div>
          ))}
        </div>

        <div style={{ textAlign: "center", fontSize: 9, color: COLORS.textDim, marginTop: 16, letterSpacing: 2 }}>
          PHASES 1 & 2 COMPLETE · PHASE 3 NEXT — API GATEWAY + APP CONTAINERS
        </div>
      </div>
    </div>
  );
}
