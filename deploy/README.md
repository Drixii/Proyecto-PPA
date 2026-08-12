# Despliegue en DigitalOcean

Backend (FastAPI) en un droplet. Frontend sigue en Vercel — no se mueve.

## Qué droplet

| Recurso | Elección |
|---|---|
| Imagen | Ubuntu 24.04 LTS |
| Región | **NYC3** (mejor compromiso LATAM + USA + Europa) |
| Plan | Basic Regular, **2 GB RAM / 1 vCPU / 50 GB** (~$12/mes) |
| Backups DO | Activados (+20%, ~$2.4/mes) |
| Autenticación | Clave SSH, **no contraseña** |

No bajes a 1 GB: Postgres + uvicorn se quedan sin memoria.

## Instalación

### 1. Crear el droplet y entrar

```bash
ssh root@IP_DEL_DROPLET
```

### 2. Apuntar el DNS

En tu proveedor de dominio, registro **A**:

```
api.TUDOMINIO.com  ->  IP_DEL_DROPLET
```

Hazlo antes del paso 4; certbot necesita que el dominio ya resuelva.

### 3. Ejecutar el bootstrap

```bash
curl -O https://raw.githubusercontent.com/Drixii/Proyecto-PPA/main/deploy/setup-server.sh
bash setup-server.sh
```

Instala y configura: Python 3.12 + venv, Postgres (con usuario y clave generados),
nginx, systemd, ufw, fail2ban, logrotate, actualizaciones automáticas y el cron de backups.

### 4. Poner tu dominio y sacar el certificado

```bash
sed -i 's/api\.TUDOMINIO\.com/api.tudominio.com/' /etc/nginx/sites-available/ppa-api
nginx -t && systemctl reload nginx
certbot --nginx -d api.tudominio.com
```

Certbot renueva solo. Comprobar con `systemctl status certbot.timer`.

### 5. Completar el `.env`

```bash
nano /opt/ppa/backend/.env     # DUFFEL_API_KEY, claves de Spaces
systemctl restart ppa-api
```

`DATABASE_URL` y `SECRET_KEY` ya vienen generados por el bootstrap.

### 6. Crear el admin inicial

```bash
cd /opt/ppa/backend && sudo -u ppa venv/bin/python seed_admin.py
```

### 7. Apuntar el frontend al nuevo backend

En Vercel → proyecto `ppa` → Settings → Environment Variables:

```
VITE_API_URL = https://api.tudominio.com
```

Sin barra final — `services/api.js` le concatena `/api`. Luego redespliega.

## Uso diario

```bash
systemctl status ppa-api          # estado
journalctl -u ppa-api -f          # logs en vivo
bash /opt/ppa/deploy/deploy.sh    # actualizar al último commit de main
```

`deploy.sh` hace backup antes, comprueba `/health` después y **revierte solo**
al commit anterior si la API no levanta.

## Backups

Cron diario a las 03:15 → `/var/backups/ppa` y, si configuras Spaces, también al bucket.
Incluye base de datos y carpeta `uploads/`. Verifica cada dump con `pg_restore --list`.

**Configura Spaces.** Un backup que solo vive en el droplet muere con el droplet.
DO Spaces son ~$5/mes por 250 GB: Settings → Spaces → crear bucket → generar
Access Key, y rellenar `SPACES_*` en el `.env`.

Restaurar:

```bash
systemctl stop ppa-api
sudo -u postgres dropdb ppa && sudo -u postgres createdb -O ppa ppa
pg_restore -d "postgresql://ppa:CLAVE@localhost:5432/ppa" /var/backups/ppa/ppa-FECHA.dump
systemctl start ppa-api
```

**Prueba una restauración ahora, no el día que la necesites.** Un backup sin
restauración probada no es un backup, es una suposición.

## Monitoreo

Da de alta `https://api.tudominio.com/health` en UptimeRobot (gratis) para
enterarte de una caída por email en vez de por un cliente.

Para saber si el cron de backups deja de correr, crea un check en
[healthchecks.io](https://healthchecks.io) y pon su URL en `BACKUP_PING_URL`.
Si un día no llega el ping, te avisa.

## Límites conocidos

**Un solo worker de uvicorn, a propósito.** El chat mantiene las conexiones
WebSocket en un diccionario en memoria (`routers/chat.py`). Con dos workers,
dos usuarios en procesos distintos dejan de verse los mensajes. Para escalar a
varios workers o varios servidores hay que mover el broadcast a Redis pub/sub
antes. Un worker aguanta de sobra el tráfico actual.

**El scheduler vive dentro de la app.** `services/scheduler.py` actualiza las
tasas cada 30 min mientras el proceso esté vivo. Es correcto con un worker;
con varios se duplicarían las llamadas.

**`uploads/` en el disco del droplet.** Los sirve nginx directamente. Entran en
el backup diario. Si crece mucho, migrar a Spaces.
