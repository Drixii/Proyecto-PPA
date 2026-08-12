#!/usr/bin/env bash
# Bootstrap de un droplet NUEVO de Ubuntu 24.04 para PPA.
# Ejecutar como root, UNA sola vez, en un servidor recien creado.
#
#   ssh root@IP_DEL_DROPLET
#   bash setup-server.sh
#
# Idempotente en lo posible, pero pensado para maquina limpia.

set -euo pipefail

# Sin esto, apt se queda esperando respuesta humana: Ubuntu 24.04 abre el
# dialogo de needrestart preguntando que servicios reiniciar, y el script
# se cuelga indefinidamente.
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
export NEEDRESTART_SUSPEND=1

APP_USER=ppa
APP_DIR=/opt/ppa
REPO_URL="https://github.com/Drixii/Proyecto-PPA.git"

say() { echo -e "\n=== $1 ===\n"; }

[ "$(id -u)" -eq 0 ] || { echo "Ejecutar como root"; exit 1; }

say "1/9 Actualizando sistema"
apt-get update
apt-get upgrade -y

say "2/9 Instalando paquetes"
apt-get install -y \
    python3 python3-venv python3-dev build-essential \
    postgresql postgresql-contrib libpq-dev \
    nginx certbot python3-certbot-nginx \
    git curl ufw fail2ban s3cmd unattended-upgrades

# Node hace falta en el servidor para compilar el frontend: la web se sirve
# desde este mismo droplet, no desde Vercel.
if ! command -v node > /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
fi

say "3/9 Creando usuario de aplicacion"
id -u "$APP_USER" &>/dev/null || adduser --system --group --home "$APP_DIR" "$APP_USER"

# adduser deja el home en 750, y nginx corre como www-data: sin permiso de
# paso no puede leer frontend/dist y todas las páginas devuelven 404.
# El .env queda en 600, así que los secretos siguen protegidos.
chmod 755 "$APP_DIR"

say "4/9 Configurando Postgres"
DB_PASS=$(openssl rand -hex 24)
# ALTER en el ELSE, no solo CREATE: al reejecutar el script se genera un
# DB_PASS nuevo que acabaría en el .env, y sin este ALTER el rol conservaría
# la clave vieja — la app no podría conectar.
sudo -u postgres psql <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ppa') THEN
    CREATE ROLE ppa LOGIN PASSWORD '$DB_PASS';
  ELSE
    ALTER ROLE ppa LOGIN PASSWORD '$DB_PASS';
  END IF;
END \$\$;
SQL
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='ppa'" | grep -q 1 \
    || sudo -u postgres createdb -O ppa ppa
echo "Clave de Postgres generada (se escribe en el .env): $DB_PASS"

say "5/9 Clonando repositorio"
# No se usa `git clone` porque adduser ya creó $APP_DIR como home del usuario:
# clone falla si el directorio destino existe. init + fetch sí funciona sobre
# un directorio existente.
mkdir -p "$APP_DIR"
# $APP_DIR pertenece al usuario ppa (adduser lo creó como su home) pero git
# corre como root: sin esto aborta con "detected dubious ownership".
git config --global --add safe.directory "$APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
    git init -q "$APP_DIR"
    git -C "$APP_DIR" remote add origin "$REPO_URL"
fi
git -C "$APP_DIR" fetch -q origin main
git -C "$APP_DIR" checkout -f -B main origin/main
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

say "6/9 Creando entorno virtual e instalando dependencias"
sudo -u "$APP_USER" python3 -m venv "$APP_DIR/backend/venv"
sudo -u "$APP_USER" "$APP_DIR/backend/venv/bin/pip" install --upgrade pip
sudo -u "$APP_USER" "$APP_DIR/backend/venv/bin/pip" install -r "$APP_DIR/backend/requirements.txt"
sudo -u "$APP_USER" mkdir -p "$APP_DIR/backend/uploads"/{proofs,completions,avatars,rewards}

say "6b/9 Compilando el frontend"
# Sin VITE_API_URL a propósito: al servirse web y API bajo el mismo dominio,
# el cliente llama a rutas relativas (/api, /ws) y nginx las enruta. Definir
# esa variable rompería el WebSocket del chat al apuntarlo a otro host.
cd "$APP_DIR/frontend"
sudo -u "$APP_USER" npm ci --no-audit --no-fund
sudo -u "$APP_USER" npm run build
cd /

say "7/9 Generando .env"
ENV_FILE="$APP_DIR/backend/.env"
if [ ! -f "$ENV_FILE" ]; then
    cat > "$ENV_FILE" <<ENV
DATABASE_URL=postgresql://ppa:$DB_PASS@localhost:5432/ppa
SECRET_KEY=$(openssl rand -hex 32)
FRONTEND_URL=https://proyecto-ppa.vercel.app
DUFFEL_API_KEY=
SPACES_BUCKET=
SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com
SPACES_KEY=
SPACES_SECRET=
BACKUP_RETENTION_DAYS=14
BACKUP_PING_URL=
ENV
    chown "$APP_USER:$APP_USER" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    echo ".env creado. REVISALO: falta DUFFEL_API_KEY y las claves de Spaces."
else
    echo ".env ya existe, no se toca."
fi

say "8/9 Instalando servicio, nginx, logrotate y cron de backups"
install -m 644 "$APP_DIR/deploy/ppa-api.service" /etc/systemd/system/ppa-api.service
systemctl daemon-reload
systemctl enable ppa-api
systemctl start ppa-api

# Certificado de origen para que Cloudflare (modo SSL "Full") pueda conectar.
# Sin él, nginx no escucha en 443 y Cloudflare devuelve error 521.
if [ ! -f /etc/ssl/certs/ppa-origin.crt ]; then
    openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
        -keyout /etc/ssl/private/ppa-origin.key \
        -out /etc/ssl/certs/ppa-origin.crt \
        -subj "/CN=${SITE_NAME:-api.ksatokio.com}"
fi

install -m 644 "$APP_DIR/deploy/nginx-ppa.conf" /etc/nginx/sites-available/ppa-api
sed -i "s/NOMBRE_DEL_SITIO/${SITE_NAME:-api.ksatokio.com}/" /etc/nginx/sites-available/ppa-api
ufw allow 443/tcp > /dev/null 2>&1 || true
ln -sf /etc/nginx/sites-available/ppa-api /etc/nginx/sites-enabled/ppa-api
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# El script ya está en $APP_DIR/deploy tras el clone; solo hay que hacerlo
# ejecutable. (`install` origen==destino aborta con "are the same file".)
chmod 755 "$APP_DIR/deploy/backup-db.sh"
cat > /etc/cron.d/ppa-backup <<'CRON'
# Backup diario de Postgres + uploads a las 03:15 (hora del servidor)
15 3 * * * root /opt/ppa/deploy/backup-db.sh >> /var/log/ppa-backup.log 2>&1
CRON

# Rotar logs de la app y de backups: disco lleno = base de datos caida
cat > /etc/logrotate.d/ppa <<'ROT'
/var/log/ppa-backup.log /var/log/nginx/ppa-api.*.log {
    weekly
    rotate 8
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root adm
    sharedscripts
    postrotate
        [ -f /var/run/nginx.pid ] && kill -USR1 $(cat /var/run/nginx.pid) || true
    endscript
}
ROT

say "9/9 Firewall y actualizaciones automaticas"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
systemctl enable --now fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades

cat <<FIN

========================================================
  LISTO. Pasos manuales que faltan:
========================================================

1. Apunta tu dominio: registro A  api.TUDOMINIO.com -> $(curl -s -m 5 ifconfig.me || echo IP_DEL_DROPLET)

2. Pon tu dominio real en nginx:
   sed -i 's/api.TUDOMINIO.com/api.TUDOMINIO.com/' /etc/nginx/sites-available/ppa-api
   nginx -t && systemctl reload nginx

3. Certificado HTTPS (solo cuando el DNS ya resuelva):
   certbot --nginx -d api.TUDOMINIO.com

4. Rellena las claves que faltan:
   nano /opt/ppa/backend/.env
   systemctl restart ppa-api

5. Crea el admin inicial:
   cd /opt/ppa/backend && sudo -u ppa venv/bin/python seed_admin.py

6. En Vercel, cambia VITE_API_URL a https://api.TUDOMINIO.com y redespliega.

Comprobar estado:  systemctl status ppa-api
Ver logs:          journalctl -u ppa-api -f
========================================================
FIN
