#!/bin/sh
# Install as /etc/letsencrypt/renewal-hooks/deploy/medicine-reload-nginx, mode 755.
case " $RENEWED_DOMAINS " in
  *" medicine.voicer-ai.pro "*)
    /usr/sbin/nginx -t && /bin/systemctl reload nginx
    ;;
esac
