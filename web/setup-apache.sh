#!/bin/bash
# Einmalig ausführen: sudo bash ~/bambupi/web/setup-apache.sh

set -e

echo "→ Module aktivieren..."
a2enmod proxy proxy_http headers

echo "→ Site-Config installieren..."
cp /home/bambupi/bambupi/web/bambupi-apache.conf /etc/apache2/sites-available/bambupi.conf

echo "→ BambuPi-Site aktivieren, Default deaktivieren..."
a2ensite bambupi
a2dissite 000-default

echo "→ Apache Config testen..."
apache2ctl configtest

echo "→ Apache neu starten..."
systemctl restart apache2

echo "✅ Fertig! BambuPi läuft jetzt auf Port 80."
