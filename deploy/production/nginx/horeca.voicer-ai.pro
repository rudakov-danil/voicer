# Витрина для кофеен и ресторанов: тот же кабинет Voicer (docker-nginx на 127.0.0.1:8080).
# TLS добавит certbot --nginx после того, как A-запись horeca.voicer-ai.pro укажет на этот сервер.
server {
    server_name horeca.voicer-ai.pro;

    client_max_body_size 550M;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
    }

    listen [::]:443 ssl; # managed by Certbot
    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/horeca.voicer-ai.pro/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/horeca.voicer-ai.pro/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot

}

server {
    if ($host = horeca.voicer-ai.pro) {
        return 301 https://$host$request_uri;
    } # managed by Certbot


    listen 80;
    listen [::]:80;
    server_name horeca.voicer-ai.pro;
    return 404; # managed by Certbot


}