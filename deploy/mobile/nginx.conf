# Host nginx. API gateway remains on 127.0.0.1:8080.
# Install first on port 80; certbot --nginx adds TLS after DNS resolves here.
server {
    server_name mobile.voicer-ai.pro;
    root /var/www/voicer-mobile;
    index index.html;
    client_max_body_size 101m;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy same-origin always;
    add_header Permissions-Policy "microphone=(self), camera=(), geolocation=()" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'" always;
    add_header Cache-Control "no-cache" always;

    location ~ "^/api/v1/(auth/(login|refresh|verify|mobile/(claim|refresh|verify|profile))|admin/sellers|recorder/mobile/(upload|statuses)|dashboard/clinic/doctors/[0-9a-f-]{36}/protocols(/[0-9a-f-]{36})?|dashboard/coins/sellers/[0-9a-f-]{36}|dashboard/sellers/[0-9a-f-]{36}/shift|analytics/sellers/[0-9a-f-]{36}/tips)$" {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 900s;
        proxy_send_timeout 900s;
    }
    location /api/ { return 404; }
    location / { try_files $uri $uri/ =404; }

    listen [::]:443 ssl ipv6only=on; # managed by Certbot
    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/mobile.voicer-ai.pro/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/mobile.voicer-ai.pro/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot

}

server {
    if ($host = mobile.voicer-ai.pro) {
        return 301 https://$host$request_uri;
    } # managed by Certbot


    listen 80;
    listen [::]:80;
    server_name mobile.voicer-ai.pro;
    return 404; # managed by Certbot


}