# ShopSmart AWS deployment (single EC2 host)

## Decision record

| Decision | Choice | Why | Trade-off we accept |
| --- | --- | --- | --- |
| Layout | One EC2 instance runs Caddy (HTTPS + static frontend), the Express API and PostgreSQL | Fewest AWS services for a short demo with fictional data; one bill line to watch; one place to clean up | Single point of failure. We own OS updates, the process, backups, HTTPS and cleanup |
| Region | `ap-southeast-1` (Singapore) | Closest Region to Angeles City | Must remember the Region when cleaning up |
| OS / size | Ubuntu Server 24.04 LTS, a Free-plan-eligible `t3.micro`/`t3.small` (pick one the console marks eligible), 20 GB gp3 | Small and cheap; setup adds 2 GB swap so the build fits | Slower `npm ci`/build on 1 GB RAM |
| HTTPS | Caddy with an automatic certificate for `<elastic-ip-with-dashes>.sslip.io` | Free, no domain purchase; sign-in cookies need HTTPS | Certificate depends on public DNS for sslip.io |
| Database | PostgreSQL 16 on the same instance, listening on localhost only | No extra RDS cost; browser never reaches it | Data lives on the instance volume: daily `pg_dump` backup, removed with the instance |
| Migrations | `npm run db:deploy` (`prisma migrate deploy`) on every deploy; seed only when the product table is empty | Applies committed migrations only, never resets orders | Schema changes must be committed as migrations first |
| Secrets | `/etc/shopsmart/backend.env` (root:shopsmart, mode 640), loaded by systemd | Not in git, not in the browser bundle, not in screenshots | Must be edited on the server with `sudo` |
| AI provider | `AI_PROVIDER=mock` by default (labelled in the UI); `gemini` when an approved key is set | No paid provider required; failure can be simulated with `mock-down` | Mock answers are rule-based, clearly labelled |
| Access | Customers: ShopSmart accounts (httpOnly, Secure, SameSite=Lax session cookie). AWS: root has MFA; only the account owner manages resources | App identity and AWS identity stay separate | No admin role inside ShopSmart |

## Architecture

```text
 Browser ──HTTPS 443 (internet)──► EC2 instance  <ip>.sslip.io   [security group: 80, 443 public; 22 restricted]
                                     │
                                     ├─ Caddy :80/:443  TLS certificate, security headers, access log
                                     │    ├─ /api/*  ──► Express API  127.0.0.1:3000  (systemd: shopsmart-api)
                                     │    │               │  reads /etc/shopsmart/backend.env (DATABASE_URL, AI key)
                                     │    │               ├─► PostgreSQL 16  127.0.0.1:5432  (never public)
                                     │    │               └─► Gemini API over HTTPS (only if AI_PROVIDER=gemini)
                                     │    └─ everything else ──► /var/www/shopsmart (built Vite files, SPA fallback)
                                     └─ cron 02:30 daily: pg_dump ► /var/backups/shopsmart (keeps 7)
```

| Port | Open to | Why |
| --- | --- | --- |
| 443 | Internet | The site and API over HTTPS |
| 80 | Internet | Certificate issuance and redirect to HTTPS (Caddy) |
| 22 | Your IP only, or the EC2 Instance Connect range for the Region | Administration |
| 3000 | Nobody (bound to 127.0.0.1) | Internal Express process behind Caddy |
| 5432 | Nobody (bound to localhost) | Database |

## Account, cost and cleanup

Before creating anything, check **Billing and Cost Management** for: Free or Paid plan, credit balance, credit expiry. Keep a redacted screenshot. Resources that keep using credits while idle: the running instance, its EBS volume, and the public IPv4 / Elastic IP address. Stop or terminate them after the demo.

| Service | Region | Owner | Purpose | Created | Remove by |
| --- | --- | --- | --- | --- | --- |
| EC2 instance `shopsmart-demo` | ap-southeast-1 | Robert Santiago | Caddy + API + PostgreSQL | _date_ | _demo date + 1 day_ |
| EBS volume (20 GB gp3) | ap-southeast-1 | Robert Santiago | Instance disk, holds the database | _date_ | with the instance |
| Elastic IP | ap-southeast-1 | Robert Santiago | Stable address for the sslip.io name | _date_ | release after terminating |
| Security group `shopsmart-web` | ap-southeast-1 | Robert Santiago | 80/443 public, 22 restricted | _date_ | after terminating |
| Key pair (if created) | ap-southeast-1 | Robert Santiago | SSH | _date_ | delete after demo |

Teardown: back up if needed (`sudo shopsmart-backup`), terminate the instance (this deletes the volume and the database), release the Elastic IP, delete the security group and key pair, then confirm in Billing that no resources remain in **any** Region.

## Steps

1. **Account check.** Billing and Cost Management: note plan, credits and expiry. Root user has MFA.
2. **Security group** `shopsmart-web` in ap-southeast-1: inbound HTTP 80 and HTTPS 443 from `0.0.0.0/0`; SSH 22 from *My IP* only (or the EC2 Instance Connect prefix list for the Region if you will use the browser terminal). Nothing else.
3. **Launch the instance**: Ubuntu Server 24.04 LTS (x86_64), a Free-plan-eligible size, 20 GB gp3, the security group above, name `shopsmart-demo`.
4. **Elastic IP**: allocate one and associate it with the instance. The site name is the IP with dashes plus `.sslip.io`, e.g. `13.212.45.67` becomes `13-212-45-67.sslip.io`.
5. **Connect** with EC2 Instance Connect (browser) or SSH as `ubuntu`, then run:

   ```bash
   curl -fsSLO https://raw.githubusercontent.com/000Robert000/ShopSmart/main/ShopSmart-Starter/deploy/setup-ec2.sh
   sudo bash setup-ec2.sh 13-212-45-67.sslip.io main
   ```

   The script installs PostgreSQL 16, Node.js 22 and Caddy, clones the repository, creates the database with a random password, applies migrations, seeds the empty database, builds the frontend with `VITE_API_URL=/api`, and starts everything as services.
6. **Verify** with the checks below, then from any computer:

   ```bash
   node backend/scripts/smoke.js https://13-212-45-67.sslip.io/api https://13-212-45-67.sslip.io --place-order
   ```

7. **Switch the assistant** (optional): `sudo nano /etc/shopsmart/backend.env`, set `AI_PROVIDER=gemini` and `GEMINI_API_KEY=...` (or `mock-down` to demonstrate an outage), then `sudo systemctl restart shopsmart-api`.
8. **Deploy a new commit**: `sudo bash /opt/shopsmart/app/ShopSmart-Starter/deploy/update.sh main` (backs up the database first).

## Hosted checks

| Check | Expected observation |
| --- | --- |
| Frontend and direct route | `https://<host>/` loads; refreshing `https://<host>/cart` and `/account` still shows the app |
| API connection | Browser Network tab shows requests to `https://<host>/api/...`; `/api/health` and `/api/health/ready` return ok |
| Catalog and cart | Products load; search, quantity and totals behave |
| Account and order | Guest gets 401 on `/api/orders`; owner reads own order; another customer gets 403 by direct request |
| Simulated checkout | A fictional signed-in order is saved and stock drops; invalid input 422; excess quantity 409 |
| Assistant | Answers cite only current products; no-match is honest; `mock-down` shows the fallback notice |
| Restart and logs | `sudo systemctl restart shopsmart-api` (and a full instance reboot) brings the API back; `journalctl -u shopsmart-api` shows errors without secrets |
| Secrets and credits | No `.env`, key or `DATABASE_URL` in git, `/var/www/shopsmart` files or screenshots; credits within plan |

## Symptoms

| What you see | Look at |
| --- | --- |
| Browser warns about the certificate, or the site does not open | Security group allows 80 and 443; `sudo journalctl -u caddy -n 50`; the sslip.io name matches the Elastic IP |
| Home works, refresh on `/cart` gives 404 | Caddy `try_files {path} /index.html` |
| Page loads, no products | Network tab for `/api/products`; `curl -s localhost:3000/api/health/ready`; `sudo journalctl -u shopsmart-api -n 50` |
| Sign-in seems to work but `/account` says sign in | Site must be HTTPS (cookie is Secure); `TRUST_PROXY=1`; browser blocks third-party cookies only if the API is on another site |
| Checkout fails, health ok | API log; `npm run db:deploy` applied the `customer_accounts` migration; stock |
| Assistant spins or shows the fallback | `AI_PROVIDER`, key, `AI_TIMEOUT_MS`; API log lines starting `AI model` |
| Build killed during setup | Out of memory: confirm swap with `swapon --show`, or use a larger instance |

## Configuration

| Variable | Where | Secret? | Value on EC2 |
| --- | --- | --- | --- |
| `VITE_API_URL` | Frontend build (public) | No | `/api` (same site, so no CORS needed) |
| `DATABASE_URL` | `/etc/shopsmart/backend.env` | **Yes** | generated by the setup script |
| `GEMINI_API_KEY` | `/etc/shopsmart/backend.env` | **Yes** | empty unless `AI_PROVIDER=gemini` |
| `NODE_ENV`, `HOST`, `PORT` | `/etc/shopsmart/backend.env` | No | `production`, `127.0.0.1`, `3000` |
| `FRONTEND_URL` | `/etc/shopsmart/backend.env` | No | `https://<host>` |
| `TRUST_PROXY`, `COOKIE_SECURE` | `/etc/shopsmart/backend.env` | No | `1`, `true` |
| `AI_PROVIDER`, `GEMINI_MODEL`, `AI_TIMEOUT_MS` | `/etc/shopsmart/backend.env` | No | `mock`, model list, `20000` |

Command details for Ubuntu packages, NodeSource and Caddy follow their documentation as of November 2026; check them against the current instructions if a step fails.
