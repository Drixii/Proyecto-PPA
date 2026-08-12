#!/usr/bin/env bash
# Actualiza el backend al ultimo commit de main y reinicia el servicio.
# Ejecutar como root en el droplet:  bash /opt/ppa/deploy/deploy.sh
#
# El frontend NO se toca: vive en Vercel y se despliega solo con git push.

set -euo pipefail

APP_DIR=/opt/ppa
APP_USER=ppa

say() { echo -e "\n=== $1 ==="; }

[ "$(id -u)" -eq 0 ] || { echo "Ejecutar como root"; exit 1; }

say "Backup previo (por si la migracion rompe algo)"
/opt/ppa/deploy/backup-db.sh || { echo "Backup fallo. Se aborta el deploy."; exit 1; }

say "Commit actual"
PREV=$(git -C "$APP_DIR" rev-parse HEAD)
echo "$PREV"

say "Trayendo cambios"
sudo -u "$APP_USER" git -C "$APP_DIR" fetch origin main
sudo -u "$APP_USER" git -C "$APP_DIR" reset --hard origin/main

say "Actualizando dependencias"
sudo -u "$APP_USER" "$APP_DIR/backend/venv/bin/pip" install -q -r "$APP_DIR/backend/requirements.txt"

say "Reinstalando unidad systemd si cambio"
if ! cmp -s "$APP_DIR/deploy/ppa-api.service" /etc/systemd/system/ppa-api.service; then
    install -m 644 "$APP_DIR/deploy/ppa-api.service" /etc/systemd/system/ppa-api.service
    systemctl daemon-reload
fi

say "Reiniciando API"
systemctl restart ppa-api

say "Comprobando salud"
sleep 4
for i in 1 2 3 4 5; do
    if curl -fsS -m 5 http://127.0.0.1:8000/health > /dev/null; then
        echo "OK - API responde"
        git -C "$APP_DIR" log -1 --oneline
        exit 0
    fi
    echo "intento $i fallo, reintentando..."
    sleep 3
done

echo ""
echo "!!! La API no responde tras el deploy. Volviendo al commit anterior."
sudo -u "$APP_USER" git -C "$APP_DIR" reset --hard "$PREV"
sudo -u "$APP_USER" "$APP_DIR/backend/venv/bin/pip" install -q -r "$APP_DIR/backend/requirements.txt"
systemctl restart ppa-api
echo "Rollback hecho a $PREV. Revisa: journalctl -u ppa-api -n 50"
exit 1
