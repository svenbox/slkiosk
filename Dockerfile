FROM nginx:alpine
COPY kiosk.html /usr/share/nginx/html/index.html
COPY admin.html /usr/share/nginx/html/admin.html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
