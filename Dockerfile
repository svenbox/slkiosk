FROM nginx:alpine
COPY kiosk.html /usr/share/nginx/html/index.html
COPY info.json /usr/share/nginx/html/info.json
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
