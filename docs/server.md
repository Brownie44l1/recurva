# Recurva Infrastructure Handover Document

> **Last Updated:** July 2, 2026  
> **Author:** Apataomotayo  
> **Domain:** recurva.xyz  
> **Purpose:** This document provides a complete overview of the Recurva server infrastructure for any agent, developer, or DevOps engineer taking over or assisting with deployment and maintenance.

---

## Table of Contents
1. [Domain & DNS](#1-domain--dns)
2. [Infrastructure Overview](#2-infrastructure-overview)
3. [Oracle Cloud (OCI) Setup](#3-oracle-cloud-oci-setup)
4. [Server Details](#4-server-details)
5. [SSH Access](#5-ssh-access)
6. [Installed Software](#6-installed-software)
7. [Networking & Firewall](#7-networking--firewall)
8. [Cloudflare DNS Records](#8-cloudflare-dns-records)
9. [Nginx Configuration](#9-nginx-configuration)
10. [Docker Setup](#10-docker-setup)
11. [Deployment Guide](#11-deployment-guide)
12. [Important Credentials & Locations](#12-important-credentials--locations)
13. [Known Issues & Notes](#13-known-issues--notes)
14. [TODO / Pending Tasks](#14-todo--pending-tasks)

---

## 1. Domain & DNS

| Property | Value |
|----------|-------|
| **Domain** | `recurva.xyz` |
| **Registrar** | Namecheap |
| **DNS Provider** | Cloudflare (Free Plan) |
| **Nameservers** | `graham.ns.cloudflare.com`, `melany.ns.cloudflare.com` |
| **Cloudflare Zone ID** | `36ffed71187c5c80d426baa1e632af2a` |
| **Cloudflare Account Email** | `apataomotayo0@gmail.com` |

### Subdomains
| Subdomain | Purpose | Server |
|-----------|---------|--------|
| `recurva.xyz` | Production (root) | recurva-prod |
| `www.recurva.xyz` | Production (www) | recurva-prod |
| `dev.recurva.xyz` | Development environment | recurva-dev |

---

## 2. Infrastructure Overview

```
                        ┌─────────────────┐
                        │   Cloudflare    │
                        │   (DNS + CDN)   │
                        └────────┬────────┘
                                 │
               ┌─────────────────┼─────────────────┐
               │                                   │
    ┌──────────▼──────────┐           ┌─────────────▼──────────┐
    │    recurva-prod      │           │     recurva-dev         │
    │  129.80.235.169      │           │   157.151.216.152       │
    │  VM.Standard.E2.1   │           │  VM.Standard.E2.1.Micro │
    │  recurva.xyz         │           │  dev.recurva.xyz        │
    │  www.recurva.xyz     │           │                         │
    └─────────────────────┘           └─────────────────────────┘
```

Both servers run on **Oracle Cloud Free Tier** (Ashburn, US East region).

---

## 3. Oracle Cloud (OCI) Setup

| Property | Value |
|----------|-------|
| **Account Email** | `apataomotayo0@gmail.com` |
| **Tenancy OCID** | `ocid1.tenancy.oc1..aaaaaaaafa4l6hxdqdwwngoxzix3wqrraxlhtls64sjuktozlmney6uvv22q` |
| **User OCID** | `ocid1.user.oc1..aaaaaaaaubhxaclblw5gvu3k6623lfuc5g57vkbrbtdg4jujdbclcuid7mka` |
| **Home Region** | `us-ashburn-1` |
| **Compartment** | `apataomotayo0 (root)` |

### Network Resources
| Resource | Name | OCID |
|----------|------|------|
| VCN | `recurva-vcn` | `ocid1.vcn.oc1.iad.amaaaaaaat6grtiauswce74pkgii27sa6msgvvyiahd65xljevxv6kjxiw6q` |
| Subnet | `recurva-subnet` | `ocid1.subnet.oc1.iad.aaaaaaaadmwhd46o55ge5liyfsaa3gbrwtnexqckyzx463gm4qjfjbffvifq` |
| Internet Gateway | `recurva-igw` | `ocid1.internetgateway.oc1.iad.aaaaaaaarvfhc24guym5ccczrn423w6ik7cyrz3dktcbglrqnbft5ozp3vzq` |
| Security List | Default | `ocid1.securitylist.oc1.iad.aaaaaaaajnwba6yj22zbkgx2mvnkdzdxeocqhsj2myaj5drjnhrnacsm3f4q` |
| Route Table | Default | `ocid1.routetable.oc1.iad.aaaaaaaa6wfbe4n2r4ch3cagnoialsbif6yhz5xwr3bntafrffcidk4pr2la` |

### OCI CLI
The OCI CLI is installed and configured on the **local development machine** (not on the servers).

Config location: `~/.oci/config`  
API Key: `~/.oci/oci_api_key.pem`  
Public Key: `~/.oci/oci_api_key_public.pem`

To verify CLI access:
```bash
oci iam user get --user-id ocid1.user.oc1..aaaaaaaaubhxaclblw5gvu3k6623lfuc5g57vkbrbtdg4jujdbclcuid7mka
```

---

## 4. Server Details

### recurva-prod (Production)
| Property | Value |
|----------|-------|
| **Display Name** | `recurva-prod` |
| **Public IP** | `129.80.235.169` |
| **Private IP** | `10.0.0.x` |
| **Shape** | `VM.Standard.E2.1.Micro` |
| **OCPUs** | 1 |
| **RAM** | 1 GB |
| **Storage** | 50 GB boot volume |
| **OS** | Ubuntu 22.04 LTS (x86_64) |
| **Instance OCID** | `ocid1.instance.oc1.iad.anuwcljtat6grticqhtobrlhohtnyppjtns6fejb6hsrtuu4y535hoeehkgq` |
| **Availability Domain** | `jxrJ:US-ASHBURN-AD-1` |

### recurva-dev (Development)
| Property | Value |
|----------|-------|
| **Display Name** | `recurva-dev` |
| **Public IP** | `157.151.216.152` |
| **Private IP** | `10.0.0.31` |
| **Shape** | `VM.Standard.E2.1.Micro` |
| **OCPUs** | 1 |
| **RAM** | 1 GB |
| **Storage** | 50 GB boot volume |
| **OS** | Ubuntu 22.04 LTS (x86_64) |
| **Instance OCID** | `ocid1.instance.oc1.iad.anuwcljtat6grticowsfbd6ancu6tcwook36pm6xx5vewhfb6yvcka6jipdq` |
| **Availability Domain** | `jxrJ:US-ASHBURN-AD-1` |

> **Note:** Both servers are currently `VM.Standard.E2.1.Micro` (free tier). A retry script is running to claim `VM.Standard.A1.Flex` instances (4 OCPUs / 24 GB RAM) when Oracle capacity becomes available in Ashburn. Once acquired, the Micro instances should be replaced.

---

## 5. SSH Access

### SSH Keys
| Property | Value |
|----------|-------|
| **Key Type** | ED25519 |
| **Interactive Key** | `~/.ssh/recurva` (passphrase-protected, for manual use) |
| **CI/CD Deploy Key** | `~/.ssh/recurva-deploy` (no passphrase, used by GitHub Actions) |
| **Public Keys** | `~/.ssh/recurva.pub`, `~/.ssh/recurva-deploy.pub` |
| **SSH User** | `ubuntu` |

### Connect to Servers
```bash
# Production (interactive)
ssh -i ~/.ssh/recurva ubuntu@129.80.235.169

# Development (interactive)
ssh -i ~/.ssh/recurva ubuntu@157.151.216.152

# With deploy key
ssh -i ~/.ssh/recurva-deploy ubuntu@129.80.235.169
```

> **Important:** The private keys must be kept safe and never shared or committed to any repository. The deploy key (`recurva-deploy`) is stored as a GitHub Actions secret (`SSH_PRIVATE_KEY`) and must be updated there if rotated.

### Re-add SSH Key via OCI CLI (if needed)
```bash
oci compute instance update \
  --instance-id <INSTANCE_OCID> \
  --metadata '{"ssh_authorized_keys": "<contents of new .pub key>"}'
```

---

## 6. Installed Software

Both servers have the following installed:

| Software | Version | Purpose |
|----------|---------|---------|
| Ubuntu | 22.04.5 LTS | Operating System |
| Nginx | 1.18.0 | Web server / Reverse proxy |
| Docker | 29.6.1 | Container runtime |
| Certbot | 1.21.0 | SSL certificate management |
| python3-certbot-nginx | 1.21.0 | Certbot Nginx plugin |
| netfilter-persistent | 1.0.16 | Firewall rules persistence |
| iptables-persistent | 1.0.16 | iptables rules on boot |

### Key Commands
```bash
# Check Nginx status
sudo systemctl status nginx

# Reload Nginx after config changes
sudo systemctl reload nginx

# Test Nginx config before reloading
sudo nginx -t

# Check Docker status
sudo systemctl status docker

# List running containers
docker ps

# View Nginx error logs
sudo tail -f /var/log/nginx/error.log

# View Nginx access logs
sudo tail -f /var/log/nginx/access.log
```

---

## 7. Networking & Firewall

### OCI Security List (Inbound Rules)
These are configured at the Oracle Cloud level:

| Protocol | Port | Description |
|----------|------|-------------|
| TCP | 22 | SSH |
| TCP | 80 | HTTP |
| TCP | 443 | HTTPS |
| All | All | Egress (outbound) — fully open |

### Ubuntu iptables (Internal Firewall)
Rules are saved and persist on reboot via `netfilter-persistent`.

To view current rules:
```bash
sudo iptables -L -n -v
```

To add a new port (e.g. 8080):
```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 8080 -j ACCEPT
sudo netfilter-persistent save
```

> **Important:** Oracle VMs have TWO layers of firewall — the OCI Security List (cloud level) AND Ubuntu's iptables (OS level). Both must allow a port for traffic to get through.

---

## 8. Cloudflare DNS Records

| Type | Name | Content | Proxied | Purpose |
|------|------|---------|---------|---------|
| A | `@` | `129.80.235.169` | ✅ Yes | Root domain → prod |
| A | `www` | `129.80.235.169` | ✅ Yes | www → prod |
| A | `dev` | `157.151.216.152` | ❌ No | dev subdomain → dev server |

### Managing DNS via Cloudflare API
```bash
export CF_API_TOKEN="your_token_here"
export ZONE_ID="36ffed71187c5c80d426baa1e632af2a"

# List all DNS records
curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" | python3 -m json.tool

# Add a new A record
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"type":"A","name":"subdomain","content":"IP_HERE","proxied":true}'

# Delete a record (need record ID from list first)
curl -s -X DELETE "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/RECORD_ID" \
  -H "Authorization: Bearer $CF_API_TOKEN"
```

> **Security Note:** Never commit the Cloudflare API token to any repository. Always use environment variables. Rotate the token periodically from the Cloudflare dashboard.

---

## 9. Nginx Configuration

### Key Paths
| Path | Purpose |
|------|---------|
| `/etc/nginx/nginx.conf` | Main Nginx config |
| `/etc/nginx/sites-available/` | Available site configs |
| `/etc/nginx/sites-enabled/` | Active site configs (symlinked) |
| `/var/log/nginx/access.log` | Access logs |
| `/var/log/nginx/error.log` | Error logs |

### Adding a New Site
```bash
# 1. Create config file
sudo nano /etc/nginx/sites-available/myapp.recurva.xyz

# 2. Paste config (see template below)

# 3. Enable the site
sudo ln -s /etc/nginx/sites-available/myapp.recurva.xyz /etc/nginx/sites-enabled/

# 4. Test config
sudo nginx -t

# 5. Reload Nginx
sudo systemctl reload nginx
```

### Nginx Config Template (Reverse Proxy)
```nginx
server {
    listen 80;
    server_name myapp.recurva.xyz;

    location / {
        proxy_pass http://localhost:3000;  # Your app port
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Getting SSL with Certbot
```bash
# Get certificate for a domain
sudo certbot --nginx -d yourdomain.recurva.xyz

# Renew all certificates
sudo certbot renew

# Test auto-renewal
sudo certbot renew --dry-run
```

> **Note:** Certbot auto-renewal is set up as a systemd timer. Certificates are valid for 90 days and auto-renew at 60 days.

---

## 10. Docker Setup

### Key Commands
```bash
# Run a container
docker run -d -p 3000:3000 --name myapp myimage

# View running containers
docker ps

# View all containers (including stopped)
docker ps -a

# View logs
docker logs myapp
docker logs -f myapp  # Follow logs

# Stop / Start / Restart
docker stop myapp
docker start myapp
docker restart myapp

# Remove container
docker rm myapp

# Pull latest image
docker pull myimage:latest
```

### Docker Compose Template
For apps with multiple services (e.g. app + database), create a `docker-compose.yml`:

```yaml
version: '3.8'

services:
  app:
    image: myapp:latest
    container_name: recurva-app
    restart: always
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://user:password@db:5432/recurva
    depends_on:
      - db

  db:
    image: postgres:15
    container_name: recurva-db
    restart: always
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=recurva
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

```bash
# Start all services
docker compose up -d

# Stop all services
docker compose down

# View logs
docker compose logs -f

# Rebuild and restart
docker compose up -d --build
```

---

## 11. Deployment Guide

### Environment Summary
| Environment | Domain | Server IP | Branch | Auto-deploy |
|-------------|--------|-----------|--------|-------------|
| Development | `dev.recurva.xyz` | `157.151.216.152` | `staging` | ✅ GitHub Actions (`.github/workflows/staging.yml`) |
| Production | `recurva.xyz` | `129.80.235.169` | `main` | ✅ GitHub Actions (`.github/workflows/production.yml`) |

### CI/CD Pipeline (Recommended)
The project uses GitHub Actions for automated deployments:
- **Push to `staging`** → triggers `.github/workflows/staging.yml` → rsyncs code to dev server → rebuilds Docker container
- **Push to `main`** → triggers `.github/workflows/production.yml` → runs tests → rsyncs code to prod server → rebuilds → runs migrations

### Manual Deployment Steps
```bash
# 1. SSH into the target server
ssh -i ~/.ssh/recurva ubuntu@SERVER_IP

# 2. Navigate to app directory
cd /opt/recurva

# 3. Rebuild Docker image (picks up latest code + .env changes)
docker compose up -d --build

# 4. Run migrations (if schema changed)
docker run --rm \
  -v /opt/recurva:/app \
  -w /app \
  --network "$(docker inspect recurva-db -f '{{range $net, $v := .NetworkSettings.Networks}}{{$net}}{{end}}')" \
  --env-file /opt/recurva/.env \
  oven/bun:1 \
  bun run src/db/migrate.ts

# 5. Verify the app is running
docker ps
curl http://localhost:3000/health
```

### Recommended Deployment Directory Structure
```
/opt/recurva/
├── docker-compose.yml
├── .env                  # Environment variables (never commit this)
├── nginx/
│   └── recurva.conf
└── backups/
```

### Environment Variables
Never hardcode secrets. Use a `.env` file on the server:
```bash
# /opt/recurva/.env
NODE_ENV=production
DATABASE_URL=postgresql://...
JWT_SECRET=...
API_KEY=...
```

Load in docker-compose with `env_file: .env`

---

## 12. Important Credentials & Locations

| Item | Location | Notes |
|------|----------|-------|
| SSH Private Key | `~/.ssh/recurva` (local machine) | Never share or commit |
| OCI API Private Key | `~/.oci/oci_api_key.pem` (local machine) | Never share or commit |
| OCI Config | `~/.oci/config` (local machine) | Contains region, user, tenancy |
| Cloudflare API Token | Environment variable only | Rotate regularly |
| Namecheap Login | `apataomotayo0@gmail.com` | Domain registrar |
| Oracle Cloud Login | `apataomotayo0@gmail.com` | Cloud provider |
| Cloudflare Login | `apataomotayo0@gmail.com` | DNS provider |

> **Security Rule:** No credentials, API keys, tokens, or private keys should ever be committed to any Git repository. Use `.gitignore` and environment variables.

---

## 13. Known Issues & Notes

### A1 Flex Capacity
Oracle Cloud Ashburn is currently out of `VM.Standard.A1.Flex` capacity (ARM, 4 OCPUs / 24 GB RAM). Both servers are currently running on `VM.Standard.E2.1.Micro` (1 OCPU / 1 GB RAM) as a temporary measure.

A retry script should be running on the local machine to claim A1 capacity when it becomes available:
```bash
# Check if retry script is still running
ps aux | grep "oci compute instance launch"
```

When A1 instances are successfully created:
1. Set up the new instances with the same software stack
2. Update Cloudflare DNS records to point to new IPs
3. Migrate apps and data
4. Terminate the Micro instances

### Cloudflare Dashboard Access
The Cloudflare dashboard (`dash.cloudflare.com`) was inaccessible during initial setup due to a local network issue. Use the Cloudflare API via curl as an alternative:
```bash
export CF_API_TOKEN="your_token"
export ZONE_ID="36ffed71187c5c80d426baa1e632af2a"
curl -s "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CF_API_TOKEN" | python3 -m json.tool
```

### Email (Namecheap Mailboxes)
Namecheap email (3 free mailboxes for `recurva.xyz`) has not been configured yet. MX records need to be added to Cloudflare DNS. This is a pending task.

---

## 14. TODO / Pending Tasks

- [x] Set up Nginx config for `recurva.xyz` and `dev.recurva.xyz`
- [x] Get SSL certificates via Certbot for all domains
- [x] Deploy the actual application via Docker
- [x] Set up GitHub Actions for CI/CD auto-deployment
- [ ] Configure Cloudflare SSL to **Full (Strict)** mode (currently Flexible)
- [ ] Set up Namecheap email MX records in Cloudflare
- [ ] Claim `VM.Standard.A1.Flex` instances when capacity is available
- [ ] Migrate from Micro to A1 instances
- [ ] Set up database backups
- [ ] Install and configure Fail2ban for SSH protection
- [ ] Set up uptime monitoring (e.g. UptimeRobot)
- [ ] Rotate Cloudflare API token
- [ ] Disable root SSH login on both servers
- [ ] Set up swap space on both servers (important for 1 GB RAM instances)

---

*This document should be updated whenever infrastructure changes are made.*
