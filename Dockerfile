# Red Hat UBI Node.js images run as a non-root user (1001, group 0),
# which works with OpenShift's restricted SCC and arbitrary UIDs.
FROM registry.access.redhat.com/ubi9/nodejs-22:latest AS deps
WORKDIR /opt/app-root/src
COPY --chown=1001:0 package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM registry.access.redhat.com/ubi9/nodejs-22-minimal:latest
WORKDIR /opt/app-root/src
ENV NODE_ENV=production \
    PORT=8080
COPY --from=deps --chown=1001:0 /opt/app-root/src/node_modules ./node_modules
COPY --chown=1001:0 package.json server.js ./
COPY --chown=1001:0 src ./src
COPY --chown=1001:0 public ./public
USER 1001
EXPOSE 8080
CMD ["node", "server.js"]
