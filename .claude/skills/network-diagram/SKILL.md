---
name: network-diagram
description: Use this skill whenever the user wants to visualize their network architecture, VPN topology, router connections, or device layout. Trigger for requests like "draw the network", "diagram the VPN", "show how RouterOS connects to Ubiquiti", "map the subnets", "visualize the tunnel", or any request involving network diagrams, topology maps, or architecture charts. Also trigger when the user wants to document which devices are in which VLAN, how WireGuard peers connect, or the flow of traffic through the stack. Use Mermaid for text-based diagrams and SVG when precise visual layout matters.
---

# Network Diagram Generator

Generate clear architecture diagrams for VPN/RouterOS/Ubiquiti networks. Choose the right format based on what the user needs: Mermaid for quick text-based diagrams embeddable in markdown, SVG/HTML for precise visual layouts.

## Context: This Project

- **VPN Router**: MikroTik RouterOS — manages WireGuard peers, IP assignments, firewall rules
- **Access Points**: Ubiquiti airOS devices — polled via SSH for signal, CCQ, TX/RX stats
- **Clients**: WireGuard VPN clients (nodes) provisioned by the app
- **Backend**: Node.js on the server, connects to RouterOS API (port 8728) and Ubiquiti SSH (port 22)
- **Frontend**: React app at `localhost:5173` (dev) or nginx-served (Docker)
- **Subnets**: typically `10.x.x.0/24` per VPN group

## Diagram Types

### 1. Mermaid — Network Topology
Best for: showing connections, traffic flow, service relationships.

```mermaid
graph TD
    Browser["Browser\n(React App)"] -->|HTTP :80| Nginx
    Nginx -->|proxy /api| Backend["Node.js :3001"]
    Backend -->|RouterOS API :8728| MikroTik["MikroTik\nRouterOS"]
    Backend -->|SSH :22| AP1["Ubiquiti AP1\n192.168.1.10"]
    Backend -->|SSH :22| AP2["Ubiquiti AP2\n192.168.1.11"]
    MikroTik -->|WireGuard :51820| Node1["VPN Node 1\n10.0.1.2"]
    MikroTik -->|WireGuard :51820| Node2["VPN Node 2\n10.0.1.3"]

    style MikroTik fill:#e8744f,color:#fff
    style Browser fill:#4f8ee8,color:#fff
```

### 2. Mermaid — Subnet/VLAN Layout
Best for: IP addressing, subnet boundaries, VLAN segmentation.

```mermaid
graph LR
    subgraph WAN["WAN / ISP"]
        ISP["ISP Gateway\n203.x.x.1"]
    end
    subgraph LAN["LAN 192.168.1.0/24"]
        Router["MikroTik\n192.168.1.1"]
        AP1["Ubiquiti AP1\n192.168.1.10"]
        Server["App Server\n192.168.1.50"]
    end
    subgraph VPN["VPN Tunnel 10.0.1.0/24"]
        WG["WireGuard\nInterface"]
        N1["Node 1\n10.0.1.2"]
        N2["Node 2\n10.0.1.3"]
    end
    ISP --> Router
    Router --> AP1
    Router --> Server
    Router --> WG
    WG --> N1
    WG --> N2
```

### 3. Mermaid — Provisioning Sequence
Best for: showing the order of operations (provisioning, polling, SSH).

```mermaid
sequenceDiagram
    participant UI as React UI
    participant API as Node.js API
    participant ROS as RouterOS :8728
    participant AP as Ubiquiti SSH :22

    UI->>API: POST /api/node/provision
    API->>ROS: /ip/address/add
    ROS-->>API: .id = *1A
    API->>ROS: /interface/wireguard/peers/add
    ROS-->>API: ok
    API-->>UI: { nodeId, ip, pubkey }

    loop Every 30s
        API->>AP: SSH exec "iwconfig ath0"
        AP-->>API: signal=-65 ccq=94
        API->>API: store in SQLite
    end
```

### 4. HTML/SVG — Visual Map
When the user needs a spatial visual map (not a flowchart), generate a self-contained HTML file with inline SVG:
- Rectangles for devices, labeled with IP and role
- Lines/arrows for connections
- Color coding: MikroTik = `#e8744f`, Ubiquiti = `#0090d4`, VPN nodes = `#27ae60`, server = `#2c3e50`

## What to Read Before Generating

1. `server/api.routes.js` — which device endpoints exist
2. `server/ubiquiti.service.js` — how APs are stored/identified
3. `server/db.service.js` — what data is persisted (nodes, subnets)

Ask the user: "Mermaid (for README/docs) or HTML visual map (to open in browser)?"

## Output Rules

- Always label devices with their IP if known
- Show port numbers on connections (`:8728`, `:22`, `:51820`)
- Group related devices in subgraphs/subnets
- Max ~12 nodes per diagram before splitting
